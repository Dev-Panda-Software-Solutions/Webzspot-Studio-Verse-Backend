const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")

const addTenantFavourite = async (req, res) => {
    try {
        const { event_id, media_id } = req.body
        if (!event_id || !media_id) return errorResponse(res, 'event_id and media_id are required.', 400)

        const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
        if (!loginRecord?.tenant_id) return errorResponse(res, 'Only studio accounts can add tenant favourites.', 403)

        const tenant_id = loginRecord.tenant_id

        const [eventAccess, media] = await Promise.all([
            prisma.eventTenantMapping.findFirst({ where: { event_id, tenant_id, isactive: true } }),
            prisma.uploadedMedia.findFirst({ where: { media_id, event_id, isactive: true } })
        ])
        if (!eventAccess) return errorResponse(res, 'You do not have access to this event.', 403)
        if (!media) return errorResponse(res, 'Media not found in this event.', 404)

        const favourite = await prisma.tenantFavouriteMediaMapping.upsert({
            where: { event_id_tenant_id_media_id: { event_id, tenant_id, media_id } },
            update: { isactive: true, updatedBy: req.user?.id },
            create: { event_id, tenant_id, media_id, createdBy: req.user?.id }
        })
        return successResponse(res, favourite, 'Added to studio favourites.', 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const removeTenantFavourite = async (req, res) => {
    try {
        const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
        if (!loginRecord?.tenant_id) return errorResponse(res, 'Only studio accounts can manage tenant favourites.', 403)

        const fav = await prisma.tenantFavouriteMediaMapping.findUnique({
            where: { tenant_favourite_id: req.params.id }
        })
        if (!fav) return errorResponse(res, 'Favourite not found.', 404)
        if (fav.tenant_id !== loginRecord.tenant_id) return errorResponse(res, 'Not your favourite.', 403)

        await prisma.tenantFavouriteMediaMapping.update({
            where: { tenant_favourite_id: req.params.id },
            data: { isactive: false, updatedBy: req.user?.id }
        })
        return successResponse(res, null, 'Removed from studio favourites.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getTenantFavouritesForEvent = async (req, res) => {
    try {
        const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
        if (!loginRecord?.tenant_id) return errorResponse(res, 'Only studio accounts can view tenant favourites.', 403)

        const { event_id } = req.params
        const favourites = await prisma.tenantFavouriteMediaMapping.findMany({
            where: { event_id, tenant_id: loginRecord.tenant_id, isactive: true },
            select: {
                tenant_favourite_id: true,
                media_id: true,
                media: { select: { media_id: true, media_name: true, media_type: true, media_size: true, original_size: true } }
            }
        })
        return successResponse(res, favourites)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { addTenantFavourite, removeTenantFavourite, getTenantFavouritesForEvent }
