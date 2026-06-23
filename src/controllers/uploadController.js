const path = require("path")
const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")

const UPLOADS_BASE = path.resolve(__dirname, "../../uploads")

const toUrlPath = (absPath) => {
    const rel = path.relative(UPLOADS_BASE, absPath).replace(/\\/g, "/")
    return `uploads/${rel}`
}

// Upload profile image — folder is determined by role (tenants / users / super-admins)
const uploadProfileImage = async (req, res) => {
    try {
        if (!req.file) return errorResponse(res, 'No image uploaded.', 400)
        const file_path = toUrlPath(req.file.path)
        return successResponse(res, { file_path }, 'Profile image uploaded successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

// Upload event cover image — saves to uploads/covers/
const uploadCoverImage = async (req, res) => {
    try {
        if (!req.file) return errorResponse(res, 'No image uploaded.', 400)
        const file_path = toUrlPath(req.file.path)
        return successResponse(res, { file_path }, 'Cover image uploaded successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

// Upload tenant watermark — saves to uploads/watermarks/ and auto-updates TenantSettings
const uploadWatermark = async (req, res) => {
    try {
        if (!req.file) return errorResponse(res, 'No watermark image uploaded.', 400)

        const loginId = req.user?.id
        const loginRecord = await prisma.login.findUnique({ where: { transid: loginId } })
        if (!loginRecord) return errorResponse(res, 'Unauthorized.', 401)
        if (!loginRecord.tenant_id) return errorResponse(res, 'Only tenants can upload a watermark.', 403)

        const file_path = toUrlPath(req.file.path)

        await prisma.tenantSettings.upsert({
            where: { tenant_id: loginRecord.tenant_id },
            update: { tenant_watermark_path: file_path, updatedBy: loginId },
            create: { tenant_id: loginRecord.tenant_id, tenant_watermark_path: file_path, createdBy: loginId }
        })

        return successResponse(res, { file_path }, 'Watermark uploaded and saved to your settings.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

// Public pre-signup upload — no auth required, saves to uploads/profiles/temp/
const uploadPublicProfile = async (req, res) => {
    try {
        if (!req.file) return errorResponse(res, 'No image uploaded.', 400)
        const file_path = toUrlPath(req.file.path)
        return successResponse(res, { file_path }, 'Profile image uploaded. Use this file_path in your signup request.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { uploadProfileImage, uploadCoverImage, uploadWatermark, uploadPublicProfile }
