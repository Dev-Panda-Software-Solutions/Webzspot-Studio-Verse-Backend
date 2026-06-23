const path = require("path")
const fs = require("fs")
const sharp = require("sharp")
const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")

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
        let compressedPath = originalPath

        // 2 — Compress if image
        if (isImage) {
            const compressedDir = path.join(__dirname, "../../uploads/events", event_id, "compressed")
            fs.mkdirSync(compressedDir, { recursive: true })
            const baseName = path.basename(originalPath, path.extname(originalPath))
            compressedPath = path.join(compressedDir, `${baseName}.jpg`)

            await sharp(originalPath)
                .resize({ width: 1200, withoutEnlargement: true })
                .jpeg({ quality: 70 })
                .toFile(compressedPath)
        }

        const compressedTime = new Date()
        const sizeStatsPath = isImage ? compressedPath : originalPath
        const fileStats = fs.statSync(sizeStatsPath)
        const finalSize = `${(fileStats.size / 1024).toFixed(2)} KB`

        const originalSizeKb = `${(file.size / 1024).toFixed(2)} KB`

        // 3 — Create UploadedMedia linked to stage
        const media = await prisma.uploadedMedia.create({
            data: {
                event_id,
                media_upload_stage_id: stage.media_upload_stage_id,
                media_name: file.originalname,
                media_type: file.mimetype,
                media_size: finalSize,
                original_size: originalSizeKb,
                media_server_path: originalPath,
                compressed_server_path: compressedPath,
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
                media_compressed: isImage ? "1" : "0",
                media_compressed_time: isImage ? compressedTime : null,
                media_original_uploaded: "1",
                media_original_uploaded_time: new Date(),
                media_original_server_path: originalPath,
                media_compressed_uploaded: isImage ? "1" : "0",
                media_compressed_uploaded_time: isImage ? new Date() : null,
                media_compressed_server_path: isImage ? compressedPath : "N/A - Original Used",
                updatedBy: req.user?.id || "SYSTEM"
            }
        })

        return successResponse(res, media, 'Media Uploaded Successfully.', 201)
    } catch (err) {
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
                where: { event_id, user_id: loginRecord?.user_id, isactive: true }
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
                where: { event_id: media.event_id, user_id: loginRecord?.user_id, isactive: true }
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

        if (media.compressed_server_path && media.compressed_server_path !== media.media_server_path && fs.existsSync(media.compressed_server_path)) {
            fs.unlinkSync(media.compressed_server_path)
        }
        if (media.media_server_path && fs.existsSync(media.media_server_path)) {
            fs.unlinkSync(media.media_server_path)
        }

        await prisma.uploadedMedia.delete({ where: { media_id: req.params.id } })
        return successResponse(res, null, 'Media Permanently Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { uploadMedia, getAllMediaByEvent, getMediaById, deleteMedia, hardDeleteMedia }
