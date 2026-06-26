const path = require("path")
const fs = require("fs")
const jwt = require("jsonwebtoken")
const _archiverMod = require("archiver")
const archiver = typeof _archiverMod === 'function' ? _archiverMod : (_archiverMod.default || _archiverMod.create)
const prisma = require("../utils/prismaClient")
const s3Storage = require("../utils/s3Storage")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")

const UPLOADS_DIR = path.resolve(__dirname, "../../uploads")

const safePath = (filePath) => {
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith(UPLOADS_DIR)) return null
    return resolved
}

// Escape characters that are special inside HTML attributes/content
const escHtml = (str) => String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav"
}

const getContentType = (filePath, fallback) => {
    const ext = path.extname(filePath || "").toLowerCase()
    return MIME_BY_EXT[ext] || fallback || "application/octet-stream"
}

const getMediaFileMeta = async (filePath, fallbackType) => {
    if (s3Storage.isS3Path(filePath)) {
        const head = await s3Storage.headObject(filePath)
        if (!head) return null
        return {
            contentType: head.ContentType || getContentType(filePath, fallbackType),
            fileSize: head.ContentLength || 0
        }
    }

    const safe = safePath(filePath)
    if (!safe || !fs.existsSync(safe)) return null
    return {
        localPath: safe,
        contentType: getContentType(safe, fallbackType),
        fileSize: fs.statSync(safe).size
    }
}

const appendArchiveFile = async (archive, filePath, name) => {
    if (s3Storage.isS3Path(filePath)) {
        const stream = await s3Storage.getObjectStream(filePath)
        if (stream) archive.append(stream, { name })
        return
    }

    const safe = safePath(filePath)
    if (safe && fs.existsSync(safe)) archive.file(safe, { name })
}

const getMediaToken = async (req, res) => {
    try {
        const { media_id } = req.params
        const loginId = req.user?.id

        const loginRecord = await prisma.login.findUnique({ where: { transid: loginId } })
        if (!loginRecord) return errorResponse(res, 'Unauthorized.', 401)

        const media = await prisma.uploadedMedia.findUnique({ where: { media_id } })
        if (!media || !media.isactive) return errorResponse(res, 'Media not found.', 404)

        if (loginRecord.user_id) {
            const access = await prisma.eventUserMapping.findFirst({
                where: { event_id: media.event_id, user_id: loginRecord.user_id, isactive: true },
                select: { event_user_id: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this media.', 403)
        }

        if (loginRecord.tenant_id) {
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id: media.event_id, tenant_id: loginRecord.tenant_id, isactive: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this media.', 403)
        }

        // SUPER_ADMIN — unrestricted access

        const dynamicExpiry = process.env.MEDIA_TOKEN_DYNAMIC_EXPIRY !== "false"
        let expiresIn, expiresLabel

        if (!dynamicExpiry) {
            // Fixed expiry set by admin in .env (MEDIA_TOKEN_EXPIRES_MIN, default 10)
            const fixedMin = Math.max(1, parseInt(process.env.MEDIA_TOKEN_EXPIRES_MIN) || 10)
            expiresIn = `${fixedMin}m`
            expiresLabel = `${fixedMin} minutes`
        } else {
            // Dynamic: based on media type and file size
            const sizeKB = parseFloat(media.media_size) || 0
            const sizeMB = sizeKB / 1024

            if (media.media_type?.startsWith("audio/")) {
                expiresIn = "90m"; expiresLabel = "90 minutes"
            } else if (media.media_type?.startsWith("video/")) {
                const estimatedMin = Math.ceil(sizeMB / 2 / 60) + 20
                const capped = Math.max(30, Math.min(estimatedMin, 240))
                expiresIn = `${capped}m`; expiresLabel = `${capped} minutes`
            } else {
                // Image
                expiresIn = "10m"; expiresLabel = "10 minutes"
            }
        }

        const mediaToken = jwt.sign(
            { media_id, user_login_id: loginId, type: "view" },
            process.env.JWT_SECRET,
            { expiresIn }
        )

        return successResponse(res, { token: mediaToken, expires_in: expiresLabel, media_type: media.media_type }, 'Media token generated.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const serveMedia = async (req, res) => {
    try {
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin")
        res.setHeader("Access-Control-Allow-Origin", "*")
        const { token } = req.params

        let decoded
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET)
        } catch {
            return res.status(401).json({ success: false, message: "Token expired or invalid. Request a new media token." })
        }

        if (decoded.type !== "view") return res.status(403).json({ success: false, message: "Invalid token type." })

        const media = await prisma.uploadedMedia.findUnique({ where: { media_id: decoded.media_id } })
        if (!media || !media.isactive) return res.status(404).json({ success: false, message: "Media not found." })

        const filePath = media.compressed_server_path || media.media_server_path
        const fileMeta = await getMediaFileMeta(filePath, media.media_type)
        if (!fileMeta) return res.status(404).json({ success: false, message: "File not found." })

        const contentType = fileMeta.contentType
        const fileSize = fileMeta.fileSize
        const rangeHeader = req.headers.range
        const acceptHeader = req.headers.accept || ""
        const isVideo = contentType.startsWith("video/")
        const isAudio = contentType.startsWith("audio/")
        const isImage = contentType.startsWith("image/")

        // If Accept header contains text/html it's a direct browser navigation — serve HTML wrapper
        const isBrowserNav = acceptHeader.includes("text/html")
        if (isBrowserNav) {
            // Fetch tenant watermark for this event
            let watermarkUrl = null
            if (media.event_id) {
                const ownerMapping = await prisma.eventTenantMapping.findFirst({
                    where: { event_id: media.event_id, collaboration_role: "OWNER", isactive: true }
                })
                if (ownerMapping?.tenant_id) {
                    const settings = await prisma.tenantSettings.findFirst({
                        where: { tenant_id: ownerMapping.tenant_id }
                    })
                    if (settings?.tenant_watermark_path) {
                        watermarkUrl = `/${settings.tenant_watermark_path}`
                    }
                }
            }

            const streamUrl = "?raw=1"

            // Validate watermark is a safe relative upload path before embedding in HTML
            if (watermarkUrl && !/^\/uploads\//.test(watermarkUrl)) watermarkUrl = null

            const safeWm = watermarkUrl ? escHtml(watermarkUrl) : null
            const safeStream = escHtml(streamUrl)
            const wmTag = safeWm
                ? `<img id="wm" src="${safeWm}" draggable="false" oncontextmenu="return false"
                     style="position:absolute;bottom:2%;right:2%;max-width:18%;opacity:0.8;pointer-events:none;display:block">`
                : ''

            const html = isVideo ? `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="robots" content="noindex,noarchive">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
#wrap{position:relative;display:inline-flex}
video{max-width:100vw;max-height:100vh;display:block;outline:none}
#wm{position:absolute;bottom:2%;right:2%;max-width:18%;opacity:0.8;pointer-events:none}
</style></head><body>
<div id="wrap">
<video id="vid" controls controlslist="nodownload nofullscreen"
  disablepictureinpicture disableremoteplayback oncontextmenu="return false">
  <source src="${safeStream}" type="${escHtml(contentType)}">
</video>
${safeWm ? `<img id="wm" src="${safeWm}" draggable="false" oncontextmenu="return false">` : ''}
</div>
<script>
document.addEventListener('contextmenu',e=>e.preventDefault());
${safeWm ? `
const vid=document.getElementById('vid');
const wm=document.getElementById('wm');
function posWm(){
  if(!vid.videoWidth||!wm.naturalWidth)return;
  const r=vid.getBoundingClientRect();
  const va=vid.videoWidth/vid.videoHeight;
  const ra=r.width/r.height;
  let cw,ch,ox,oy;
  if(ra>va){ch=r.height;cw=ch*va;ox=(r.width-cw)/2;oy=0;}
  else{cw=r.width;ch=cw/va;ox=0;oy=(r.height-ch)/2;}
  const wmW=Math.round(cw*0.16);
  const mg=Math.round(cw*0.02);
  wm.style.width=wmW+'px';
  wm.style.right=mg+'px';
  wm.style.bottom=mg+'px';
}
let vr=false,wr=false;
vid.addEventListener('loadedmetadata',()=>{vr=true;if(wr)posWm();});
wm.addEventListener('load',()=>{wr=true;if(vr)posWm();});
window.addEventListener('resize',posWm);
` : ''}
</script>
</body></html>` : isAudio ? `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="robots" content="noindex,noarchive">
<style>*{margin:0;padding:0;box-sizing:border-box}
body{background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh}
audio{width:420px;max-width:90vw;outline:none}
</style></head><body>
<audio controls controlslist="nodownload" oncontextmenu="return false">
  <source src="${safeStream}" type="${escHtml(contentType)}">
</audio>
<script>document.addEventListener('contextmenu',e=>e.preventDefault())</script>
</body></html>` : `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="robots" content="noindex,noarchive">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#111;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
#wrap{position:relative;background:no-repeat center/cover}
</style></head><body>
<div id="wrap">${wmTag}</div>
<script>
document.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&['s','u','p'].includes(e.key.toLowerCase()))e.preventDefault();
});
const wrap=document.getElementById('wrap');
const img=new Image();
img.onload=function(){
  const vw=window.innerWidth,vh=window.innerHeight;
  const scale=Math.min(vw/img.naturalWidth,vh/img.naturalHeight);
  wrap.style.width=Math.round(img.naturalWidth*scale)+'px';
  wrap.style.height=Math.round(img.naturalHeight*scale)+'px';
  wrap.style.backgroundImage="url('${safeStream}')";
};
img.src='${safeStream}';
</script>
</body></html>`
            res.setHeader("Content-Type", "text/html; charset=utf-8")
            res.setHeader("Cache-Control", "no-store")
            res.setHeader("X-Robots-Tag", "noindex, noarchive, nosnippet")
            res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'")
            return res.status(200).send(html)
        }

        // Raw bytes — for <img src>, <video src>, range requests, ?raw=1
        res.setHeader("Content-Type", contentType)
        res.setHeader("Accept-Ranges", "bytes")
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate")
        res.setHeader("X-Content-Type-Options", "nosniff")
        res.setHeader("Content-Disposition", "inline")
        res.setHeader("X-Robots-Tag", "noindex, noarchive, nosnippet")
        res.setHeader("Content-Security-Policy", "default-src 'none'")

        if (rangeHeader) {
            const [startStr, endStr] = rangeHeader.replace("bytes=", "").split("-")
            const start = parseInt(startStr, 10)
            const end = endStr ? parseInt(endStr, 10) : fileSize - 1
            const chunkSize = end - start + 1

            if (start >= fileSize || end >= fileSize) {
                res.setHeader("Content-Range", `bytes */${fileSize}`)
                return res.status(416).end()
            }

            res.status(206)
            res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`)
            res.setHeader("Content-Length", chunkSize)
            if (s3Storage.isS3Path(filePath)) {
                const stream = await s3Storage.getObjectStream(filePath, `bytes=${start}-${end}`)
                if (!stream) return res.status(404).json({ success: false, message: "File not found." })
                stream.pipe(res)
            } else {
                fs.createReadStream(fileMeta.localPath, { start, end }).pipe(res)
            }
        } else {
            res.setHeader("Content-Length", fileSize)
            if (s3Storage.isS3Path(filePath)) {
                const stream = await s3Storage.getObjectStream(filePath)
                if (!stream) return res.status(404).json({ success: false, message: "File not found." })
                stream.pipe(res)
            } else {
                fs.createReadStream(fileMeta.localPath).pipe(res)
            }
        }
    } catch (err) {
        return res.status(500).json({ success: false, message: "An error occurred while serving the file." })
    }
}

const sanitizeFilename = (name) =>
    (name || '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'unknown'

const downloadUserFavouritesAsZip = async (req, res) => {
    try {
        const { event_id, user_id } = req.params
        const loginId = req.user?.id

        const loginRecord = await prisma.login.findUnique({ where: { transid: loginId } })
        if (!loginRecord) return errorResponse(res, 'Unauthorized.', 401)
        if (!loginRecord.tenant_id) return errorResponse(res, 'Only tenants can download favourites zip.', 403)

        const tenantAccess = await prisma.eventTenantMapping.findFirst({
            where: { event_id, tenant_id: loginRecord.tenant_id, isactive: true }
        })
        if (!tenantAccess) return errorResponse(res, 'You do not have access to this event.', 403)

        const [favourites, eventRecord, userRecord] = await Promise.all([
            prisma.userFavouriteMediaMapping.findMany({
                where: { event_id, user_id, isactive: true },
                include: { media: true }
            }),
            prisma.event.findUnique({ where: { event_id }, select: { event_name: true } }),
            prisma.user.findUnique({ where: { user_id }, select: { user_name: true } })
        ])

        if (favourites.length === 0) return errorResponse(res, 'No favourites found for this user.', 404)

        const eventName = sanitizeFilename(eventRecord?.event_name)
        const userName = sanitizeFilename(userRecord?.user_name)
        const zipName = `${eventName}_(${userName}).zip`

        res.setHeader("Content-Type", "application/zip")
        res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`)
        res.setHeader("Cache-Control", "no-store")

        const archive = archiver("zip", { zlib: { level: 9 } })

        archive.on('error', (archiveErr) => {
            console.error('Archiver error:', archiveErr)
            if (!res.headersSent) {
                return res.status(500).json({ success: false, message: 'Failed to generate zip file.', data: null })
            }
            res.end()
        })

        archive.pipe(res)

        for (const fav of favourites) {
            await appendArchiveFile(archive, fav.media.media_server_path, path.basename(fav.media.media_name))
        }

        await archive.finalize()
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const downloadTenantFavouritesAsZip = async (req, res) => {
    try {
        const { event_id } = req.params
        const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
        if (!loginRecord?.tenant_id) return errorResponse(res, 'Only studio accounts can download.', 403)

        const tenantAccess = await prisma.eventTenantMapping.findFirst({
            where: { event_id, tenant_id: loginRecord.tenant_id, isactive: true }
        })
        if (!tenantAccess) return errorResponse(res, 'You do not have access to this event.', 403)

        const [favourites, eventRecord, tenantRecord] = await Promise.all([
            prisma.tenantFavouriteMediaMapping.findMany({
                where: { event_id, tenant_id: loginRecord.tenant_id, isactive: true },
                include: { media: true }
            }),
            prisma.event.findUnique({ where: { event_id }, select: { event_name: true } }),
            prisma.tenant.findUnique({ where: { tenant_id: loginRecord.tenant_id }, select: { tenant_studio_name: true } })
        ])

        if (favourites.length === 0) return errorResponse(res, 'No studio favourites found for this event.', 404)

        const eventName = sanitizeFilename(eventRecord?.event_name)
        const studioName = sanitizeFilename(tenantRecord?.tenant_studio_name)
        const zipName = `${eventName}_(${studioName}_Favourites).zip`

        res.setHeader("Content-Type", "application/zip")
        res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`)
        res.setHeader("Cache-Control", "no-store")

        const archive = archiver("zip", { zlib: { level: 9 } })
        archive.on('error', (err) => {
            if (!res.headersSent) return res.status(500).json({ success: false, message: 'Failed to generate zip file.', data: null })
            res.end()
        })
        archive.pipe(res)

        for (const fav of favourites) {
            await appendArchiveFile(archive, fav.media.media_server_path, path.basename(fav.media.media_name))
        }

        await archive.finalize()
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { getMediaToken, serveMedia, downloadUserFavouritesAsZip, downloadTenantFavouritesAsZip }
