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
                prisma.eventUserMapping.findFirst({ where: { event_id, user_id }, select: { event_user_id: true, isactive: true } }),
            ])

            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
            if (!targetUser || targetUser.created_by_tenant_id !== loginRecord?.tenant_id) {
                return errorResponse(res, 'You can only assign users you created to events.', 403)
            }

            if (existing) {
                if (existing.isactive) return errorResponse(res, 'User is already assigned to this event.', 400)
                const parsedExpiry = parseAccessExpiry(access_expires)
                const updated = await prisma.eventUserMapping.update({
                    where: { event_user_id: existing.event_user_id },
                    data: {
                        isactive: true,
                        ...(parsedExpiry != null ? { access_expires: parsedExpiry } : {}),
                        updatedBy: req.user?.id,
                    }
                })
                return successResponse(res, updated, 'User Access Restored Successfully.', 200)
            }
        } else {
            const existing = await prisma.eventUserMapping.findFirst({ where: { event_id, user_id }, select: { event_user_id: true, isactive: true } })
            if (existing) {
                if (existing.isactive) return errorResponse(res, 'User is already assigned to this event.', 400)
                const parsedExpiry = parseAccessExpiry(access_expires)
                const updated = await prisma.eventUserMapping.update({
                    where: { event_user_id: existing.event_user_id },
                    data: {
                        isactive: true,
                        ...(parsedExpiry != null ? { access_expires: parsedExpiry } : {}),
                        updatedBy: req.user?.id,
                    }
                })
                return successResponse(res, updated, 'User Access Restored Successfully.', 200)
            }
        }

        const parsedExpiry = parseAccessExpiry(access_expires)
        const mapping = await prisma.eventUserMapping.create({
            data: {
                event_id, user_id,
                ...(parsedExpiry != null ? { access_expires: parsedExpiry } : {}),
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
        const { access_expires, isactive, favourite_limit, favourites_submitted } = req.body

        const mapping = await prisma.eventUserMapping.findUnique({ where: { event_user_id: id }, select: { event_user_id: true, event_id: true } })
        if (!mapping) return errorResponse(res, 'Mapping not found.', 404)

        if (req.user.role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id: mapping.event_id, tenant_id: loginRecord?.tenant_id, isactive: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        const updateData = { updatedBy: req.user?.id }
        if (access_expires !== undefined) {
            const parsedExpiry = parseAccessExpiry(access_expires)
            if (parsedExpiry != null) updateData.access_expires = parsedExpiry
        }
        if (isactive !== undefined) updateData.isactive = Boolean(isactive)
        if (favourite_limit !== undefined) {
            const parsedLimit = favourite_limit === null || favourite_limit === '' ? null : Number.parseInt(favourite_limit, 10)
            if (parsedLimit !== null && (!Number.isFinite(parsedLimit) || parsedLimit < 0)) {
                return errorResponse(res, 'favourite_limit must be a non-negative integer or null.', 400)
            }
            updateData.favourite_limit = parsedLimit
        }
        // Studio can trigger a submit on the client's behalf, or unlock a submitted
        // selection back to editable (favourites_submitted: false clears it).
        if (favourites_submitted !== undefined) {
            updateData.favourites_submitted_at = favourites_submitted ? new Date() : null
        }

        const updated = await prisma.eventUserMapping.update({
            where: { event_user_id: id },
            data: updateData,
            select: {
                event_user_id: true, isactive: true, favourite_limit: true, favourites_submitted_at: true,
                user: { select: { user_id: true, user_name: true, user_email_id: true } }
            }
        })
        return successResponse(res, updated, 'Access updated successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

// Client submits their own favourite selection for this event — locks it against
// further changes until the studio unlocks it (via updateEventUserMapping).
const submitFavouritesForEvent = async (req, res) => {
    try {
        const { id } = req.params
        const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
        if (!loginRecord?.user_id) return errorResponse(res, 'Only client accounts can submit favourites.', 403)

        const mapping = await prisma.eventUserMapping.findUnique({ where: { event_user_id: id } })
        if (!mapping) return errorResponse(res, 'Mapping not found.', 404)
        if (mapping.user_id !== loginRecord.user_id) return errorResponse(res, 'You can only submit your own favourites.', 403)
        if (!mapping.isactive) return errorResponse(res, 'You do not have access to this event.', 403)
        if (mapping.favourites_submitted_at) return errorResponse(res, 'Favourites have already been submitted.', 400)

        const updated = await prisma.eventUserMapping.update({
            where: { event_user_id: id },
            data: { favourites_submitted_at: new Date(), updatedBy: req.user?.id }
        })
        return successResponse(res, updated, 'Favourites Submitted Successfully.')
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
                favourite_limit: true,
                favourites_submitted_at: true,
                createdAt: true,
                user: { select: { user_id: true, user_name: true, user_email_id: true, user_phone_number: true, isactive: true } }
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
            select: {
                event_user_id: true,
                event_id: true,
                isactive: true,
                createdAt: true,
                event: true,
            }
        })
        return successResponse(res, mappings)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const removeUserFromEvent = async (req, res) => {
    try {
        const mapping = await prisma.eventUserMapping.findUnique({ where: { event_user_id: req.params.id }, select: { event_user_id: true, event_id: true } })
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
        const mapping = await prisma.eventUserMapping.findUnique({ where: { event_user_id: req.params.id }, select: { event_user_id: true, event_id: true } })
        if (!mapping) return errorResponse(res, 'User-Event mapping not found.', 404)

        if (req.user.role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id: mapping.event_id, tenant_id: loginRecord?.tenant_id, isactive: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        await prisma.eventUserMapping.delete({ where: { event_user_id: req.params.id } })
        return successResponse(res, null, 'User Mapping Permanently Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { assignUserToEvent, updateEventUserMapping, submitFavouritesForEvent, getUsersByEvent, getEventsByUser, removeUserFromEvent, hardDeleteUserFromEvent }
