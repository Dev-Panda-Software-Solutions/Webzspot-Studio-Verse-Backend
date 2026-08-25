const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")

const verifyTenantOwnership = async (loginId, tenant_id) => {
    const loginRecord = await prisma.login.findUnique({ where: { transid: loginId } })
    return loginRecord?.tenant_id === tenant_id
}

const createTenantSettings = async (req, res) => {
    try {
        const { tenant_watermark_path } = req.body

        // ADMIN always creates settings for themselves — SUPER_ADMIN can pass tenant_id in body
        let tenant_id
        if (req.user.role === "SUPER_ADMIN") {
            tenant_id = req.body.tenant_id
            if (!tenant_id) return errorResponse(res, 'tenant_id is required.', 400)
        } else {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            tenant_id = loginRecord?.tenant_id
            if (!tenant_id) return errorResponse(res, 'Tenant account not found.', 404)
        }

        const settings = await prisma.tenantSettings.create({
            data: { tenant_id, tenant_watermark_path, createdBy: req.user?.id || "SYSTEM" }
        })
        return successResponse(res, settings, 'Tenant Settings Created Successfully.', 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getTenantSettings = async (req, res) => {
    try {
        if (req.user.role === "ADMIN") {
            const isOwner = await verifyTenantOwnership(req.user?.id, req.params.tenant_id)
            if (!isOwner) return errorResponse(res, 'You can only access your own settings.', 403)
        }

        const settings = await prisma.tenantSettings.findUnique({ where: { tenant_id: req.params.tenant_id } })
        if (!settings) return errorResponse(res, 'Tenant Settings Not Found.', 404)

        // USER role: only expose the client-facing settings (watermark + brand colours)
        if (req.user.role === "USER") {
            return successResponse(res, {
                tenant_watermark_path: settings.tenant_watermark_path,
                primary_color: settings.primary_color,
                secondary_color: settings.secondary_color,
            })
        }

        return successResponse(res, settings)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const updateTenantSettings = async (req, res) => {
    try {
        if (req.user.role === "ADMIN") {
            const isOwner = await verifyTenantOwnership(req.user?.id, req.params.tenant_id)
            if (!isOwner) return errorResponse(res, 'You can only update your own settings.', 403)
        }

        const { tenant_watermark_path, primary_color, secondary_color, gstin_number, gst_state } = req.body
        const settings = await prisma.tenantSettings.upsert({
            where: { tenant_id: req.params.tenant_id },
            update: {
                ...(tenant_watermark_path !== undefined ? { tenant_watermark_path } : {}),
                ...(primary_color !== undefined ? { primary_color } : {}),
                ...(secondary_color !== undefined ? { secondary_color } : {}),
                ...(gstin_number !== undefined ? { gstin_number } : {}),
                ...(gst_state !== undefined ? { gst_state } : {}),
                updatedBy: req.user?.id
            },
            create: {
                tenant_id: req.params.tenant_id,
                tenant_watermark_path,
                primary_color,
                secondary_color,
                gstin_number,
                gst_state,
                createdBy: req.user?.id || "SYSTEM"
            }
        })
        return successResponse(res, settings, 'Tenant Settings Updated Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const deleteTenantSettings = async (req, res) => {
    try {
        if (req.user.role === "ADMIN") {
            const isOwner = await verifyTenantOwnership(req.user?.id, req.params.tenant_id)
            if (!isOwner) return errorResponse(res, 'You can only manage your own settings.', 403)
        }
        await prisma.tenantSettings.update({
            where: { tenant_id: req.params.tenant_id },
            data: { isactive: false, updatedBy: req.user?.id }
        })
        return successResponse(res, null, 'Tenant Settings Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const hardDeleteTenantSettings = async (req, res) => {
    try {
        if (req.user.role === "ADMIN") {
            const isOwner = await verifyTenantOwnership(req.user?.id, req.params.tenant_id)
            if (!isOwner) return errorResponse(res, 'You can only manage your own settings.', 403)
        }
        await prisma.tenantSettings.delete({ where: { tenant_id: req.params.tenant_id } })
        return successResponse(res, null, 'Tenant Settings Permanently Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { createTenantSettings, getTenantSettings, updateTenantSettings, deleteTenantSettings, hardDeleteTenantSettings }
