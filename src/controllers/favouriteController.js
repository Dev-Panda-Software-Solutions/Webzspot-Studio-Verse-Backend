const prisma = require("../utils/prismaClient")
const { withMediaUrl } = require("../utils/mediaUrl")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")

const addFavourite = async (req, res) => {
    try {
        const { event_id, media_id } = req.body
        if (!event_id || !media_id) return errorResponse(res, 'event_id and media_id are required.', 400)

        const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
        if (!loginRecord) return errorResponse(res, 'Unauthorized.', 401)
        if (!loginRecord.user_id) return errorResponse(res, 'Only users can add favourites.', 403)

        const user_id = loginRecord.user_id

        // Check event access, media existence, and duplicate all in parallel
        const [eventAccess, media, existing] = await Promise.all([
            prisma.eventUserMapping.findFirst({ where: { event_id, user_id, isactive: true }, select: { event_user_id: true } }),
            prisma.uploadedMedia.findFirst({ where: { media_id, event_id, isactive: true } }),
            prisma.userFavouriteMediaMapping.findFirst({ where: { event_id, user_id, media_id, isactive: true } })
        ])

        if (!eventAccess) return errorResponse(res, 'You do not have access to this event.', 403)
        if (!media) return errorResponse(res, 'Media not found in this event.', 404)
        if (existing) return errorResponse(res, 'Already in favourites.', 400)

        const favourite = await prisma.userFavouriteMediaMapping.create({
            data: { event_id, user_id, media_id, createdBy: req.user?.id }
        })
        return successResponse(res, favourite, 'Media Added To Favourites Successfully.', 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getFavouritesByUser = async (req, res) => {
    try {
        const { role, id: loginId } = req.user
        const { user_id: paramUserId, event_id } = req.params

        let user_id = paramUserId

        if (role === "USER") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: loginId } })
            if (!loginRecord) return errorResponse(res, 'Unauthorized.', 401)
            user_id = loginRecord.user_id
            if (event_id) {
                const access = await prisma.eventUserMapping.findFirst({
                    where: { event_id, user_id, isactive: true },
                    select: { event_user_id: true }
                })
                if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
            }
        } else if (role === "ADMIN") {
            const [loginRecord, targetUser] = await Promise.all([
                prisma.login.findUnique({ where: { transid: loginId } }),
                prisma.user.findUnique({ where: { user_id: paramUserId } })
            ])
            if (!loginRecord) return errorResponse(res, 'Unauthorized.', 401)
            if (!targetUser || targetUser.created_by_tenant_id !== loginRecord?.tenant_id) {
                return errorResponse(res, 'You can only view favourites of users you created.', 403)
            }
        }

        const where = { user_id, isactive: true }
        if (event_id) where.event_id = event_id

        const favourites = await prisma.userFavouriteMediaMapping.findMany({
            where,
            include: {
                media: { select: { media_id: true, media_name: true, media_type: true, media_size: true, original_size: true, compressed_server_path: true } },
                event: { select: { event_id: true, event_name: true } }
            }
        })

        const favouritesWithUrls = await Promise.all(
            favourites.map(async (f) => ({ ...f, media: await withMediaUrl(f.media) }))
        )
        return successResponse(res, favouritesWithUrls)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getEventFavouritesGroupedByUser = async (req, res) => {
    try {
        const { event_id } = req.params
        const loginRecord = req.loginRecord
        if (!loginRecord) return errorResponse(res, 'Unauthorized.', 401)

        if (loginRecord.role !== "SUPER_ADMIN") {
            if (!loginRecord.tenant_id) return errorResponse(res, 'Only tenants can access this view.', 403)
            const tenantAccess = await prisma.eventTenantMapping.findFirst({
                where: { event_id, tenant_id: loginRecord.tenant_id, isactive: true }
            })
            if (!tenantAccess) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        const favourites = await prisma.userFavouriteMediaMapping.findMany({
            where: { event_id, isactive: true },
            include: {
                user: { select: { user_id: true, user_name: true, user_email_id: true } },
                media: { select: { media_id: true, media_name: true, media_type: true, media_size: true, original_size: true, compressed_server_path: true } }
            }
        })

        const grouped = {}
        for (const fav of favourites) {
            const uid = fav.user.user_id
            if (!grouped[uid]) grouped[uid] = { user: fav.user, favourites: [] }
            const media = await withMediaUrl(fav.media)
            grouped[uid].favourites.push({ ...media, favourite_id: fav.user_favourite_media_id })
        }

        return successResponse(res, Object.values(grouped))
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const removeFavourite = async (req, res) => {
    try {
        const { role, id: loginId } = req.user

        const fav = await prisma.userFavouriteMediaMapping.findUnique({ where: { user_favourite_media_id: req.params.id } })
        if (!fav) return errorResponse(res, 'Favourite not found.', 404)

        if (role === "USER") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: loginId } })
            if (!loginRecord) return errorResponse(res, 'Unauthorized.', 401)
            if (fav.user_id !== loginRecord.user_id) return errorResponse(res, 'You can only remove your own favourites.', 403)
        }

        if (role === "ADMIN") {
            const [loginRecord, targetUser] = await Promise.all([
                prisma.login.findUnique({ where: { transid: loginId } }),
                prisma.user.findUnique({ where: { user_id: fav.user_id } })
            ])
            if (!loginRecord) return errorResponse(res, 'Unauthorized.', 401)
            if (!targetUser || targetUser.created_by_tenant_id !== loginRecord?.tenant_id) {
                return errorResponse(res, 'You can only remove favourites of users you created.', 403)
            }
        }

        await prisma.userFavouriteMediaMapping.update({
            where: { user_favourite_media_id: req.params.id },
            data: { isactive: false, updatedBy: req.user?.id }
        })
        return successResponse(res, null, 'Media Removed From Favourites Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const hardDeleteFavourite = async (req, res) => {
    try {
        await prisma.userFavouriteMediaMapping.delete({ where: { user_favourite_media_id: req.params.id } })
        return successResponse(res, null, 'Favourite Permanently Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { addFavourite, getFavouritesByUser, getEventFavouritesGroupedByUser, removeFavourite, hardDeleteFavourite }
