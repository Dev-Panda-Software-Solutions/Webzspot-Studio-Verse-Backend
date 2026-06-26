const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")
const { parseAccessExpiry } = require("../utils/eventAccess")

const assignUserToEvent = async (req, res) => {
    try {
        const { event_id, user_id, access_expires } = req.body
        if (!event_id || !user_id) return errorResponse(res, 'event_id and user_id are required.', 400)

        if (req.user.role === "ADMIN") {
            const [loginRecord, targetUser] = await Promise.all([
                prisma.login.findUnique({ where: { transid: req.user?.id } }),
                prisma.user.findUnique({ where: { user_id } }),
            ])

            const [access, existing] = await Promise.all([
                prisma.eventTenantMapping.findFirst({ where: { event_id, tenant_id: loginRecord?.tenant_id, isactive: true } }),
                prisma.eventUserMapping.findFirst({ where: { event_id, user_id } }),
            ])

            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
            if (!targetUser || targetUser.created_by_tenant_id !== loginRecord?.tenant_id) {
                return errorResponse(res, 'You can only assign users you created to events.', 403)
            }

            if (existing) {
                if (existing.isactive) return errorResponse(res, 'User is already assigned to this event.', 400)
                const updated = await prisma.eventUserMapping.update({
                    where: { event_user_id: existing.event_user_id },
                    data: {
                        isactive: true,
                        access_expires: parseAccessExpiry(access_expires),
                        updatedBy: req.user?.id,
                    }
                })
                return successResponse(res, updated, 'User Access Restored Successfully.', 200)
            }
        } else {
            const existing = await prisma.eventUserMapping.findFirst({ where: { event_id, user_id } })
            if (existing) {
                if (existing.isactive) return errorResponse(res, 'User is already assigned to this event.', 400)
                const updated = await prisma.eventUserMapping.update({
                    where: { event_user_id: existing.event_user_id },
                    data: {
                        isactive: true,
                        access_expires: parseAccessExpiry(access_expires),
                        updatedBy: req.user?.id,
                    }
                })
                return successResponse(res, updated, 'User Access Restored Successfully.', 200)
            }
        }

        const mapping = await prisma.eventUserMapping.create({
            data: {
                event_id, user_id,
                access_expires: parseAccessExpiry(access_expires),
                createdBy: req.user?.id || "SYSTEM",
            }
        })
        return successResponse(res, mapping, 'User Assigned To Event Successfully.', 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const updateEventUserMapping = async (req, res) => {
    try {
        const { id } = req.params
        const { access_expires, isactive } = req.body

        const mapping = await prisma.eventUserMapping.findUnique({ where: { event_user_id: id } })
        if (!mapping) return errorResponse(res, 'Mapping not found.', 404)

        if (req.user.role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id: mapping.event_id, tenant_id: loginRecord?.tenant_id, isactive: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        const updateData = { updatedBy: req.user?.id }
        if (access_expires !== undefined) updateData.access_expires = parseAccessExpiry(access_expires)
        if (isactive !== undefined) updateData.isactive = Boolean(isactive)

        const updated = await prisma.eventUserMapping.update({
            where: { event_user_id: id },
            data: updateData,
            select: {
                event_user_id: true, isactive: true,
                access_expires: true,
                user: { select: { user_id: true, user_name: true, user_email_id: true } }
            }
        })
        return successResponse(res, updated, 'Access updated successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getUsersByEvent = async (req, res) => {
    try {
        const { event_id } = req.params

        if (req.user.role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id, tenant_id: loginRecord?.tenant_id, isactive: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        const mappings = await prisma.eventUserMapping.findMany({
            where: { event_id },
            select: {
                event_user_id: true,
                event_id: true,
                isactive: true,
                access_expires: true,
                createdAt: true,
                user: { select: { user_id: true, user_name: true, user_email_id: true, user_phone_number: true } }
            },
            orderBy: { createdAt: 'asc' }
        })
        return successResponse(res, mappings)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getEventsByUser = async (req, res) => {
    try {
        const { user_id } = req.params

        if (req.user.role === "ADMIN") {
            const [loginRecord, targetUser] = await Promise.all([
                prisma.login.findUnique({ where: { transid: req.user?.id } }),
                prisma.user.findUnique({ where: { user_id } })
            ])
            if (!targetUser || targetUser.created_by_tenant_id !== loginRecord?.tenant_id) {
                return errorResponse(res, 'You can only view events for users you created.', 403)
            }
        }

        const mappings = await prisma.eventUserMapping.findMany({
            where: { user_id, isactive: true },
            include: { event: true }
        })
        return successResponse(res, mappings)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const removeUserFromEvent = async (req, res) => {
    try {
        const mapping = await prisma.eventUserMapping.findUnique({ where: { event_user_id: req.params.id } })
        if (!mapping) return errorResponse(res, 'User-Event mapping not found.', 404)

        if (req.user.role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id: mapping.event_id, tenant_id: loginRecord?.tenant_id, isactive: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        await prisma.eventUserMapping.update({
            where: { event_user_id: req.params.id },
            data: { isactive: false, updatedBy: req.user?.id }
        })
        return successResponse(res, null, 'User Removed From Event Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const hardDeleteUserFromEvent = async (req, res) => {
    try {
        await prisma.eventUserMapping.delete({ where: { event_user_id: req.params.id } })
        return successResponse(res, null, 'User Mapping Permanently Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { assignUserToEvent, updateEventUserMapping, getUsersByEvent, getEventsByUser, removeUserFromEvent, hardDeleteUserFromEvent }
