const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")

// Fields safe to return — never expose server paths
const SAFE_STAGE_SELECT = {
    media_upload_stage_id: true,
    event_id: true,
    media_name: true,
    media_type: true,
    media_size: true,
    media_upload_status: true,
    media_upload_start: true,
    media_upload_start_time: true,
    media_uploaded: true,
    media_uploaded_time: true,
    media_compressed: true,
    media_compressed_time: true,
    media_original_uploaded: true,
    media_original_uploaded_time: true,
    media_compressed_uploaded: true,
    media_compressed_uploaded_time: true,
    isactive: true,
    createdAt: true,
    updatedAt: true
}

const verifyTenantEventAccess = async (tenantLoginId, event_id) => {
    const loginRecord = await prisma.login.findUnique({ where: { transid: tenantLoginId } })
    const access = await prisma.eventTenantMapping.findFirst({
        where: { event_id, tenant_id: loginRecord?.tenant_id, isactive: true }
    })
    return !!access
}

const createMediaUploadStage = async (req, res) => {
    try {
        const { event_id, media_name, media_type, media_size } = req.body
        if (!event_id || !media_name || !media_type || !media_size) {
            return errorResponse(res, 'event_id, media_name, media_type and media_size are required.', 400)
        }

        if (req.user.role === "ADMIN") {
            const hasAccess = await verifyTenantEventAccess(req.user?.id, event_id)
            if (!hasAccess) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        const stage = await prisma.mediaUploadStage.create({
            data: {
                event_id, media_name, media_type, media_size,
                media_upload_status: "Upload Just Started",
                media_upload_start: "1",
                media_upload_start_time: new Date(),
                createdBy: req.user?.id || "SYSTEM"
            },
            select: SAFE_STAGE_SELECT
        })
        return successResponse(res, stage, 'Media Upload Stage Created Successfully.', 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getAllMediaUploadStagesByEvent = async (req, res) => {
    try {
        const { event_id } = req.params

        if (req.user.role === "ADMIN") {
            const hasAccess = await verifyTenantEventAccess(req.user?.id, event_id)
            if (!hasAccess) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        const stages = await prisma.mediaUploadStage.findMany({
            where: { event_id, isactive: true },
            select: SAFE_STAGE_SELECT
        })
        return successResponse(res, stages)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getMediaUploadStageById = async (req, res) => {
    try {
        const stage = await prisma.mediaUploadStage.findUnique({
            where: { media_upload_stage_id: req.params.id },
            select: { ...SAFE_STAGE_SELECT, event_id: true }
        })
        if (!stage) return errorResponse(res, 'Media Upload Stage Not Found.', 404)

        if (req.user.role === "ADMIN") {
            const hasAccess = await verifyTenantEventAccess(req.user?.id, stage.event_id)
            if (!hasAccess) return errorResponse(res, 'You do not have access to this stage.', 403)
        }

        return successResponse(res, stage)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const updateMediaUploadStage = async (req, res) => {
    try {
        const existing = await prisma.mediaUploadStage.findUnique({ where: { media_upload_stage_id: req.params.id } })
        if (!existing) return errorResponse(res, 'Media Upload Stage Not Found.', 404)

        if (req.user.role === "ADMIN") {
            const hasAccess = await verifyTenantEventAccess(req.user?.id, existing.event_id)
            if (!hasAccess) return errorResponse(res, 'You do not have access to this stage.', 403)
        }

        const { media_uploaded, media_compressed, media_original_uploaded, media_compressed_uploaded } = req.body
        const updateData = { updatedBy: req.user?.id }

        if (media_uploaded === "1") {
            updateData.media_uploaded = "1"
            updateData.media_uploaded_time = new Date()
            updateData.media_upload_status = "File Uploaded"
        }
        if (media_compressed === "1") {
            updateData.media_compressed = "1"
            updateData.media_compressed_time = new Date()
            updateData.media_upload_status = "File Compressed"
        }
        if (media_original_uploaded === "1") {
            updateData.media_original_uploaded = "1"
            updateData.media_original_uploaded_time = new Date()
            updateData.media_upload_status = "Original Saved To Cloud"
        }
        if (media_compressed_uploaded === "1") {
            updateData.media_compressed_uploaded = "1"
            updateData.media_compressed_uploaded_time = new Date()
            updateData.media_upload_status = "Completed"
        }

        const updated = await prisma.mediaUploadStage.update({
            where: { media_upload_stage_id: req.params.id },
            data: updateData,
            select: SAFE_STAGE_SELECT
        })
        return successResponse(res, updated, 'Media Upload Stage Updated Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const deleteMediaUploadStage = async (req, res) => {
    try {
        const existing = await prisma.mediaUploadStage.findUnique({ where: { media_upload_stage_id: req.params.id } })
        if (!existing) return errorResponse(res, 'Media Upload Stage Not Found.', 404)

        if (req.user.role === "ADMIN") {
            const hasAccess = await verifyTenantEventAccess(req.user?.id, existing.event_id)
            if (!hasAccess) return errorResponse(res, 'You do not have access to this stage.', 403)
        }

        await prisma.mediaUploadStage.update({
            where: { media_upload_stage_id: req.params.id },
            data: { isactive: false, updatedBy: req.user?.id }
        })
        return successResponse(res, null, 'Media Upload Stage Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const hardDeleteMediaUploadStage = async (req, res) => {
    try {
        await prisma.mediaUploadStage.delete({ where: { media_upload_stage_id: req.params.id } })
        return successResponse(res, null, 'Media Upload Stage Permanently Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { createMediaUploadStage, getAllMediaUploadStagesByEvent, getMediaUploadStageById, updateMediaUploadStage, deleteMediaUploadStage, hardDeleteMediaUploadStage }
