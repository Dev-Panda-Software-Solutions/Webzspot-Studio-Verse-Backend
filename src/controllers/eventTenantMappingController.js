const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")

const assignTenantToEvent = async (req, res) => {
    try {
        const { event_id, tenant_id, collaboration_role } = req.body
        if (!event_id || !tenant_id) return errorResponse(res, 'event_id and tenant_id are required.', 400)

        const validRoles = ["OWNER", "EDITOR", "VIEWER"]
        const role = collaboration_role && validRoles.includes(collaboration_role) ? collaboration_role : "EDITOR"

        if (req.user.role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            const ownerMapping = await prisma.eventTenantMapping.findFirst({
                where: { event_id, tenant_id: loginRecord?.tenant_id, collaboration_role: "OWNER", isactive: true }
            })
            if (!ownerMapping) return errorResponse(res, 'Only the event OWNER can assign collaborators.', 403)
        }

        const existing = await prisma.eventTenantMapping.findFirst({ where: { event_id, tenant_id, isactive: true } })
        if (existing) return errorResponse(res, 'This tenant is already assigned to this event.', 400)

        const mapping = await prisma.eventTenantMapping.create({
            data: { event_id, tenant_id, collaboration_role: role, createdBy: req.user?.id || "SYSTEM" }
        })
        return successResponse(res, mapping, 'Tenant Assigned To Event Successfully.', 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const updateCollaborationRole = async (req, res) => {
    try {
        const { collaboration_role } = req.body
        const validRoles = ["OWNER", "EDITOR", "VIEWER"]
        if (!validRoles.includes(collaboration_role)) return errorResponse(res, 'collaboration_role must be OWNER, EDITOR, or VIEWER.', 400)

        if (req.user.role === "ADMIN") {
            const [mapping, loginRecord] = await Promise.all([
                prisma.eventTenantMapping.findUnique({ where: { event_tenant_mapping_id: req.params.id } }),
                prisma.login.findUnique({ where: { transid: req.user?.id } })
            ])
            if (!mapping) return errorResponse(res, 'Mapping not found.', 404)
            const ownerCheck = await prisma.eventTenantMapping.findFirst({
                where: { event_id: mapping.event_id, tenant_id: loginRecord?.tenant_id, collaboration_role: "OWNER", isactive: true }
            })
            if (!ownerCheck) return errorResponse(res, 'Only the event OWNER can change collaboration roles.', 403)
        }

        const updated = await prisma.eventTenantMapping.update({
            where: { event_tenant_mapping_id: req.params.id },
            data: { collaboration_role, updatedBy: req.user?.id }
        })
        return successResponse(res, updated, 'Collaboration role updated successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getTenantsByEvent = async (req, res) => {
    try {
        const { event_id } = req.params

        if (req.user.role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id, tenant_id: loginRecord?.tenant_id, isactive: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        const mappings = await prisma.eventTenantMapping.findMany({
            where: { event_id, isactive: true },
            select: {
                event_tenant_mapping_id: true,
                collaboration_role: true,
                createdAt: true,
                tenant: { select: { tenant_id: true, tenant_name: true, tenant_studio_name: true } }
            }
        })
        return successResponse(res, mappings)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const removeTenantFromEvent = async (req, res) => {
    try {
        if (req.user.role === "ADMIN") {
            const [mapping, loginRecord] = await Promise.all([
                prisma.eventTenantMapping.findUnique({ where: { event_tenant_mapping_id: req.params.id } }),
                prisma.login.findUnique({ where: { transid: req.user?.id } })
            ])
            if (!mapping) return errorResponse(res, 'Mapping not found.', 404)
            const ownerCheck = await prisma.eventTenantMapping.findFirst({
                where: { event_id: mapping.event_id, tenant_id: loginRecord?.tenant_id, collaboration_role: "OWNER", isactive: true }
            })
            if (!ownerCheck) return errorResponse(res, 'Only the event OWNER can remove collaborators.', 403)
        }

        await prisma.eventTenantMapping.update({
            where: { event_tenant_mapping_id: req.params.id },
            data: { isactive: false, updatedBy: req.user?.id }
        })
        return successResponse(res, null, 'Tenant Removed From Event Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const hardDeleteTenantFromEvent = async (req, res) => {
    try {
        await prisma.eventTenantMapping.delete({ where: { event_tenant_mapping_id: req.params.id } })
        return successResponse(res, null, 'Tenant Mapping Permanently Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { assignTenantToEvent, updateCollaborationRole, getTenantsByEvent, removeTenantFromEvent, hardDeleteTenantFromEvent }
