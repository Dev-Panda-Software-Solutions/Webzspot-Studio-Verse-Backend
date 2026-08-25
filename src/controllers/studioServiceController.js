const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")
const { resolveTenantId } = require("../utils/billingAccess")

const createService = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        if (!tenant_id) return errorResponse(res, "Only studio accounts can manage services.", 403)

        const { name, price } = req.body
        if (!name?.trim()) return errorResponse(res, "Name is required.", 400)

        const service = await prisma.studioService.create({
            data: {
                tenant_id,
                name: name.trim(),
                price: price !== undefined && price !== null && price !== "" ? Number(price) : null,
                createdBy: req.user?.id
            }
        })
        return successResponse(res, service, "Service Created Successfully.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getAllServices = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        if (!tenant_id) return errorResponse(res, "Only studio accounts can view services.", 403)

        const status = req.query.status === "archived" ? false : req.query.status === "all" ? undefined : true
        const where = { tenant_id, ...(status === undefined ? {} : { isactive: status }) }

        const items = await prisma.studioService.findMany({ where, orderBy: { createdAt: "desc" } })
        return successResponse(res, { items })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const updateService = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        const existing = await prisma.studioService.findUnique({ where: { studio_service_id: req.params.id } })
        if (!existing || existing.tenant_id !== tenant_id) return errorResponse(res, "Service Not Found.", 404)

        const { name, price } = req.body
        const service = await prisma.studioService.update({
            where: { studio_service_id: req.params.id },
            data: {
                ...(name !== undefined ? { name: name.trim() } : {}),
                ...(price !== undefined ? { price: price !== null && price !== "" ? Number(price) : null } : {}),
                updatedBy: req.user?.id
            }
        })
        return successResponse(res, service, "Service Updated Successfully.")
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const deleteService = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        const existing = await prisma.studioService.findUnique({ where: { studio_service_id: req.params.id } })
        if (!existing || existing.tenant_id !== tenant_id) return errorResponse(res, "Service Not Found.", 404)

        await prisma.studioService.update({
            where: { studio_service_id: req.params.id },
            data: { isactive: false, updatedBy: req.user?.id }
        })
        return successResponse(res, null, "Service Deleted Successfully.")
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const restoreService = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        const existing = await prisma.studioService.findUnique({ where: { studio_service_id: req.params.id } })
        if (!existing || existing.tenant_id !== tenant_id) return errorResponse(res, "Service Not Found.", 404)

        const service = await prisma.studioService.update({
            where: { studio_service_id: req.params.id },
            data: { isactive: true, updatedBy: req.user?.id }
        })
        return successResponse(res, service, "Service Restored Successfully.")
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { createService, getAllServices, updateService, deleteService, restoreService }
