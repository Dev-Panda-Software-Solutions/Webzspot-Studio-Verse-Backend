const path = require("path")
const fs = require("fs")
const sharp = require("sharp")
const prisma = require("../utils/prismaClient")
const s3Storage = require("../utils/s3Storage")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")
const { activeUserEventAccessWhere } = require("../utils/eventAccess")

const MAX_LARGE_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_EXTS = new Set([".jpeg", ".jpg", ".png", ".gif", ".mp4", ".mov", ".avi", ".mkv", ".mp3", ".wav"])

const SAFE_MEDIA_SELECT = {
    media_id: true,
    event_id: true,
    media_upload_stage_id: true,
    media_name: true,
    media_type: true,
    media_size: true,
    original_size: true,
    isactive: true,
    createdAt: true,
    updatedAt: true
}

const formatKb = (bytes) => `${((Number(bytes) || 0) / 1024).toFixed(2)} KB`

const assertCanUploadToEvent = async (req, event_id) => {
    if (!event_id || !UUID_REGEX.test(event_id)) return 'Invalid or missing event_id.'
    const loginRecord = req.loginRecord
    if (!loginRecord) return 'Unauthorized.'

    if (req.user.role === "ADMIN") {
        const access = await prisma.eventTenantMapping.findFirst({
            where: { event_id, tenant_id: loginRecord.tenant_id, isactive: true }
        })
        if (!access) return 'You do not have access to this event.'
    }

    return null
}

const safeUploadName = (name) => {
    const ext = path.extname(name || "").toLowerCase()
    if (!ALLOWED_EXTS.has(ext)) return null
    const base = path.basename(name, ext).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "media"
    return `${Date.now()}-${Math.round(Math.random() * 1e9)}-${base}${ext}`
}

const uploadMedia = async (req, res) => {
    try {
        if (!req.file) return errorResponse(res, 'No file uploaded.', 400)

        const event_id = req.body.event_id || req.query.event_id
        if (!event_id) return errorResponse(res, 'event_id is required.', 400)

        const loginRecord = req.loginRecord
        if (!loginRecord) return errorResponse(res, 'Unauthorized.', 401)

        if (req.user.role === "ADMIN") {
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id, tenant_id: loginRecord.tenant_id, isactive: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        const file = req.file
        if (!s3Storage.isConfigured()) {
            fs.unlink(file.path, () => {})
            return errorResponse(res, 'Private media storage is not configured. Set AWS_S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.', 500)
        }

        const uploadStartTime = new Date()

        // 1 — Register stage: file has landed on disk
        const stage = await prisma.mediaUploadStage.create({
            data: {
                event_id,
                media_name: file.originalname,
                media_type: file.mimetype,
                media_size: `${(file.size / 1024).toFixed(2)} KB`,
                media_upload_status: "Uploaded",
                media_upload_start: "1",
                media_upload_start_time: uploadStartTime,
                media_uploaded: "1",
                media_uploaded_time: new Date(),
                createdBy: req.user?.id || "SYSTEM"
            }
        })

        const originalPath = file.path
        const isImage = /\.(jpeg|jpg|png|gif)$/i.test(path.extname(file.originalname))
        let compressedImageCreated = false
        let compressedPath = originalPath

        // 2 — Compress if image
        if (isImage) {
            const compressedDir = path.join(__dirname, "../../uploads/events", event_id, "compressed")
            fs.mkdirSync(compressedDir, { recursive: true })
            const baseName = path.basename(originalPath, path.extname(originalPath))
            compressedPath = path.join(compressedDir, `${baseName}.jpg`)

            try {
                await sharp(originalPath, { failOn: "none" })
                    .rotate()
                    .resize({ width: 1200, withoutEnlargement: true })
                    .jpeg({ quality: 70 })
                    .toFile(compressedPath)
                compressedImageCreated = true
            } catch (compressErr) {
                console.warn(`[Upload] Compression skipped for ${file.originalname}:`, compressErr.message)
                compressedPath = originalPath
            }
        }

        const compressedTime = new Date()
        const sizeStatsPath = isImage ? compressedPath : originalPath
        const fileStats = fs.statSync(sizeStatsPath)
        const finalSize = `${(fileStats.size / 1024).toFixed(2)} KB`

        const originalSizeKb = `${(file.size / 1024).toFixed(2)} KB`
        let mediaServerPath = originalPath
        let compressedServerPath = compressedPath

        const originalKey = `events/${event_id}/original/${path.basename(originalPath)}`
        const compressedKey = compressedImageCreated
            ? `events/${event_id}/compressed/${path.basename(compressedPath)}`
            : originalKey

        mediaServerPath = await s3Storage.uploadFile({
            localPath: originalPath,
            key: originalKey,
            contentType: file.mimetype
        })

        compressedServerPath = compressedImageCreated
            ? await s3Storage.uploadFile({
                localPath: compressedPath,
                key: compressedKey,
                contentType: "image/jpeg"
            })
            : mediaServerPath

        // 3 — Create UploadedMedia linked to stage
        const media = await prisma.uploadedMedia.create({
            data: {
                event_id,
                media_upload_stage_id: stage.media_upload_stage_id,
                media_name: file.originalname,
                media_type: file.mimetype,
                media_size: finalSize,
                original_size: originalSizeKb,
                media_server_path: mediaServerPath,
                compressed_server_path: compressedServerPath,
                createdBy: req.user?.id || "SYSTEM"
            },
            select: SAFE_MEDIA_SELECT
        })

        // 4 — Update stage with final timings and paths
        await prisma.mediaUploadStage.update({
            where: { media_upload_stage_id: stage.media_upload_stage_id },
            data: {
                media_upload_status: "Completed",
                media_size: finalSize,
                media_compressed: compressedImageCreated ? "1" : "0",
                media_compressed_time: compressedImageCreated ? compressedTime : null,
                media_original_uploaded: "1",
                media_original_uploaded_time: new Date(),
                media_original_server_path: mediaServerPath,
                media_compressed_uploaded: compressedImageCreated ? "1" : "0",
                media_compressed_uploaded_time: compressedImageCreated ? new Date() : null,
                media_compressed_server_path: isImage ? compressedServerPath : mediaServerPath,
                updatedBy: req.user?.id || "SYSTEM"
            }
        })

        fs.unlink(originalPath, () => {})
        if (compressedImageCreated && compressedPath !== originalPath) fs.unlink(compressedPath, () => {})

        return successResponse(res, media, 'Media Uploaded Successfully.', 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const initiateLargeUpload = async (req, res) => {
    try {
        const { event_id, file_name, file_type, file_size } = req.body
        const accessError = await assertCanUploadToEvent(req, event_id)
        if (accessError) return errorResponse(res, accessError, accessError === 'Unauthorized.' ? 401 : 403)

        const size = Number(file_size)
        if (!Number.isFinite(size) || size <= 0) return errorResponse(res, 'file_size is required.', 400)
        if (size > MAX_LARGE_UPLOAD_BYTES) return errorResponse(res, 'File too large. Maximum allowed is 5GB per file.', 413)
        if (!s3Storage.isConfigured()) return errorResponse(res, 'Private media storage is not configured.', 500)

        const uploadName = safeUploadName(file_name)
        if (!uploadName) return errorResponse(res, 'File type not allowed. Only images, videos and audio files are accepted.', 415)

        const key = `events/${event_id}/original/${uploadName}`
        const upload = await s3Storage.createMultipartUpload({ key, contentType: file_type })
        const stage = await prisma.mediaUploadStage.create({
            data: {
                event_id,
                media_name: file_name,
                media_type: file_type || "application/octet-stream",
                media_size: formatKb(size),
                media_upload_status: "Multipart Upload Started",
                media_upload_start: "1",
                media_upload_start_time: new Date(),
                createdBy: req.user?.id || "SYSTEM"
            }
        })

        return successResponse(res, {
            stage_id: stage.media_upload_stage_id,
            upload_id: upload.uploadId,
            key: upload.key,
            max_file_size: MAX_LARGE_UPLOAD_BYTES
        }, 'Large upload started.', 201)
    } catch (err) {
        console.error('[LargeUpload] initiate failed:', err)
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const uploadLargePart = async (req, res) => {
    try {
        const { event_id, key, upload_id, part_number } = req.query
        const accessError = await assertCanUploadToEvent(req, event_id)
        if (accessError) return errorResponse(res, accessError, accessError === 'Unauthorized.' ? 401 : 403)
        if (!key || !upload_id || !part_number) return errorResponse(res, 'key, upload_id and part_number are required.', 400)
        if (!String(key).startsWith(`events/${event_id}/original/`)) return errorResponse(res, 'Invalid upload key.', 400)
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) return errorResponse(res, 'Missing chunk body.', 400)

        const part = await s3Storage.uploadPart({
            key,
            uploadId: upload_id,
            partNumber: Number(part_number),
            body: req.body
        })

        return successResponse(res, part, 'Chunk uploaded.')
    } catch (err) {
        console.error('[LargeUpload] part failed:', err)
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const completeLargeUpload = async (req, res) => {
    try {
        const { event_id, stage_id, key, upload_id, file_name, file_type, file_size, parts } = req.body
        const accessError = await assertCanUploadToEvent(req, event_id)
        if (accessError) return errorResponse(res, accessError, accessError === 'Unauthorized.' ? 401 : 403)
        if (!stage_id || !key || !upload_id || !Array.isArray(parts) || parts.length === 0) {
            return errorResponse(res, 'stage_id, key, upload_id and parts are required.', 400)
        }
        if (!String(key).startsWith(`events/${event_id}/original/`)) return errorResponse(res, 'Invalid upload key.', 400)

        const size = Number(file_size)
        if (!Number.isFinite(size) || size <= 0) return errorResponse(res, 'file_size is required.', 400)
        if (size > MAX_LARGE_UPLOAD_BYTES) return errorResponse(res, 'File too large. Maximum allowed is 5GB per file.', 413)

        const mediaServerPath = await s3Storage.completeMultipartUpload({ key, uploadId: upload_id, parts })
        const sizeLabel = formatKb(size)
        const media = await prisma.uploadedMedia.create({
            data: {
                event_id,
                media_upload_stage_id: stage_id,
                media_name: file_name,
                media_type: file_type || "application/octet-stream",
                media_size: sizeLabel,
                original_size: sizeLabel,
                media_server_path: mediaServerPath,
                compressed_server_path: mediaServerPath,
                createdBy: req.user?.id || "SYSTEM"
            },
            select: SAFE_MEDIA_SELECT
        })

        await prisma.mediaUploadStage.update({
            where: { media_upload_stage_id: stage_id },
            data: {
                media_upload_status: "Completed",
                media_size: sizeLabel,
                media_uploaded: "1",
                media_uploaded_time: new Date(),
                media_original_uploaded: "1",
                media_original_uploaded_time: new Date(),
                media_original_server_path: mediaServerPath,
                media_compressed_uploaded: "0",
                media_compressed_server_path: mediaServerPath,
                updatedBy: req.user?.id || "SYSTEM"
            }
        })

        return successResponse(res, media, 'Large media uploaded successfully.', 201)
    } catch (err) {
        console.error('[LargeUpload] complete failed:', err)
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const abortLargeUpload = async (req, res) => {
    try {
        const { event_id, key, upload_id, stage_id } = req.body
        const accessError = await assertCanUploadToEvent(req, event_id)
        if (accessError) return errorResponse(res, accessError, accessError === 'Unauthorized.' ? 401 : 403)
        if (key && upload_id) await s3Storage.abortMultipartUpload({ key, uploadId: upload_id })
        if (stage_id) {
            await prisma.mediaUploadStage.update({
                where: { media_upload_stage_id: stage_id },
                data: { media_upload_status: "Aborted", updatedBy: req.user?.id || "SYSTEM" }
            }).catch(() => {})
        }
        return successResponse(res, null, 'Large upload aborted.')
    } catch (err) {
        console.error('[LargeUpload] abort failed:', err)
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getAllMediaByEvent = async (req, res) => {
    try {
        const { event_id } = req.params
        const { role, id: loginId } = req.user

        const page = Math.max(1, parseInt(req.query.page) || 1)
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
        const skip = (page - 1) * limit

        if (role === "USER") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: loginId } })
            const access = await prisma.eventUserMapping.findFirst({
                where: activeUserEventAccessWhere({ event_id, user_id: loginRecord?.user_id })
            })
            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        if (role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: loginId } })
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id, tenant_id: loginRecord?.tenant_id, isactive: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        const where = { event_id, isactive: true }
        const [items, total] = await Promise.all([
            prisma.uploadedMedia.findMany({ where, select: SAFE_MEDIA_SELECT, skip, take: limit, orderBy: { createdAt: 'desc' } }),
            prisma.uploadedMedia.count({ where })
        ])

        return successResponse(res, { items, total, page, limit, pages: Math.ceil(total / limit) })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getMediaById = async (req, res) => {
    try {
        const media = await prisma.uploadedMedia.findUnique({
            where: { media_id: req.params.id },
            select: SAFE_MEDIA_SELECT
        })
        if (!media) return errorResponse(res, 'Media Not Found.', 404)

        const { role, id: loginId } = req.user

        if (role === "USER") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: loginId } })
            const access = await prisma.eventUserMapping.findFirst({
                where: activeUserEventAccessWhere({ event_id: media.event_id, user_id: loginRecord?.user_id })
            })
            if (!access) return errorResponse(res, 'You do not have access to this media.', 403)
        }

        if (role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: loginId } })
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id: media.event_id, tenant_id: loginRecord?.tenant_id, isactive: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this media.', 403)
        }

        return successResponse(res, media)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const deleteMedia = async (req, res) => {
    try {
        const media = await prisma.uploadedMedia.findUnique({ where: { media_id: req.params.id } })
        if (!media) return errorResponse(res, 'Media Not Found.', 404)

        if (req.user.role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id: media.event_id, tenant_id: loginRecord?.tenant_id, isactive: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        await prisma.uploadedMedia.update({
            where: { media_id: req.params.id },
            data: { isactive: false, updatedBy: req.user?.id }
        })
        return successResponse(res, null, 'Media Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const hardDeleteMedia = async (req, res) => {
    try {
        const media = await prisma.uploadedMedia.findUnique({ where: { media_id: req.params.id } })
        if (!media) return errorResponse(res, 'Media Not Found.', 404)

        if (req.user.role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id: media.event_id, tenant_id: loginRecord?.tenant_id, isactive: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        if (s3Storage.isS3Path(media.compressed_server_path) && media.compressed_server_path !== media.media_server_path) {
            await s3Storage.deleteObject(media.compressed_server_path)
        } else if (media.compressed_server_path && media.compressed_server_path !== media.media_server_path && fs.existsSync(media.compressed_server_path)) {
            fs.unlinkSync(media.compressed_server_path)
        }
        if (s3Storage.isS3Path(media.media_server_path)) {
            await s3Storage.deleteObject(media.media_server_path)
        } else if (media.media_server_path && fs.existsSync(media.media_server_path)) {
            fs.unlinkSync(media.media_server_path)
        }

        await prisma.uploadedMedia.delete({ where: { media_id: req.params.id } })
        return successResponse(res, null, 'Media Permanently Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = {
    uploadMedia,
    initiateLargeUpload,
    uploadLargePart,
    completeLargeUpload,
    abortLargeUpload,
    getAllMediaByEvent,
    getMediaById,
    deleteMedia,
    hardDeleteMedia
}
