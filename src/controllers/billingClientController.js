const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")
const { resolveTenantId } = require("../utils/billingAccess")

const createBillingClient = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        if (!tenant_id) return errorResponse(res, "Only studio accounts can manage billing clients.", 403)

        const { name, email, phone } = req.body
        if (!name?.trim()) return errorResponse(res, "Name is required.", 400)
        if (!email?.trim() && !phone?.trim()) return errorResponse(res, "Email or phone is required.", 400)

        const client = await prisma.billingClient.create({
            data: {
                tenant_id,
                name: name.trim(),
                email: email?.trim() || null,
                phone: phone?.trim() || null,
                createdBy: req.user?.id
            }
        })
        return successResponse(res, client, "Client Created Successfully.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getAllBillingClients = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        if (!tenant_id) return errorResponse(res, "Only studio accounts can view billing clients.", 403)

        const search = req.query.search?.trim()
        const where = {
            tenant_id,
            isactive: true,
            ...(search ? {
                OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                    { phone: { contains: search } },
                ]
            } : {})
        }

        const items = await prisma.billingClient.findMany({ where, orderBy: { createdAt: "desc" } })
        return successResponse(res, { items })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const updateBillingClient = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        const existing = await prisma.billingClient.findUnique({ where: { billing_client_id: req.params.id } })
        if (!existing || existing.tenant_id !== tenant_id) return errorResponse(res, "Client Not Found.", 404)

        const { name, email, phone } = req.body
        const client = await prisma.billingClient.update({
            where: { billing_client_id: req.params.id },
            data: {
                ...(name !== undefined ? { name: name.trim() } : {}),
                ...(email !== undefined ? { email: email?.trim() || null } : {}),
                ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
                updatedBy: req.user?.id
            }
        })
        return successResponse(res, client, "Client Updated Successfully.")
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { createBillingClient, getAllBillingClients, updateBillingClient }
