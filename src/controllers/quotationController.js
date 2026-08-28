const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")
const { resolveTenantId, claimNextNumber, computeItemsTotal } = require("../utils/billingAccess")
const { streamQuotationPdf } = require("../utils/billingPdf")

const normalizeItems = (items) => {
    if (!Array.isArray(items)) return []
    return items
        .filter(i => i?.name?.trim())
        .map(i => ({
            name: i.name.trim(),
            price: Number(i.price) || 0,
            quantity: Math.max(1, parseInt(i.quantity) || 1),
            discount_per_unit: Number(i.discount_per_unit) || 0
        }))
}

const withTotals = (quotation) => {
    const items_total = computeItemsTotal(quotation.items || [])
    const discount_amount = Number(quotation.discount_amount || 0)
    const payable_amount = Math.max(0, items_total - discount_amount)
    return { ...quotation, items_total, payable_amount }
}

const createQuotation = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        if (!tenant_id) return errorResponse(res, "Only studio accounts can create quotations.", 403)

        const { user_id, items } = req.body
        if (!user_id) return errorResponse(res, "user_id is required.", 400)

        const client = await prisma.user.findUnique({ where: { user_id } })
        if (!client || client.created_by_tenant_id !== tenant_id) return errorResponse(res, "Client Not Found.", 404)

        const normalizedItems = normalizeItems(items)

        const quotation = await prisma.$transaction(async (tx) => {
            const quotation_number = await claimNextNumber(tx, tenant_id, "next_quotation_number")
            return tx.quotation.create({
                data: {
                    tenant_id,
                    user_id,
                    quotation_number,
                    createdBy: req.user?.id,
                    items: { create: normalizedItems }
                },
                include: { items: true, client: true }
            })
        })

        return successResponse(res, withTotals(quotation), "Quotation Created Successfully.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getAllQuotations = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        if (!tenant_id) return errorResponse(res, "Only studio accounts can view quotations.", 403)

        const page = Math.max(1, parseInt(req.query.page) || 1)
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20))
        const skip = (page - 1) * limit
        const where = { tenant_id, isactive: true }

        const [rawItems, total] = await Promise.all([
            prisma.quotation.findMany({
                where, skip, take: limit, orderBy: { quotation_number: "desc" },
                include: { items: true, client: true, bill: { select: { bill_id: true, bill_number: true } } }
            }),
            prisma.quotation.count({ where })
        ])

        const items = rawItems.map(withTotals)
        return successResponse(res, { items, total, page, limit, pages: Math.ceil(total / limit) })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getQuotationById = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        const quotation = await prisma.quotation.findUnique({
            where: { quotation_id: req.params.id },
            include: { items: { orderBy: { createdAt: "asc" } }, client: true, bill: { select: { bill_id: true, bill_number: true } } }
        })
        if (!quotation || quotation.tenant_id !== tenant_id) return errorResponse(res, "Quotation Not Found.", 404)
        return successResponse(res, withTotals(quotation))
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const downloadQuotationPdf = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        const quotation = await prisma.quotation.findUnique({
            where: { quotation_id: req.params.id },
            include: { items: { orderBy: { createdAt: "asc" } }, client: true, tenant: true }
        })
        if (!quotation || quotation.tenant_id !== tenant_id) return errorResponse(res, "Quotation Not Found.", 404)

        const settings = await prisma.tenantSettings.findUnique({ where: { tenant_id } })
        return streamQuotationPdf(res, { tenant: quotation.tenant, settings, quotation })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

// Full replace of line items + discount — the quotation builder always sends
// its whole current item list back, simpler than diffing add/remove/edit.
const updateQuotation = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        const existing = await prisma.quotation.findUnique({ where: { quotation_id: req.params.id } })
        if (!existing || existing.tenant_id !== tenant_id) return errorResponse(res, "Quotation Not Found.", 404)
        if (existing.status === "CONFIRMED") return errorResponse(res, "This quotation has already been confirmed into a bill and can no longer be edited.", 409)

        const { items, discount_amount } = req.body
        const normalizedItems = items !== undefined ? normalizeItems(items) : undefined

        const quotation = await prisma.$transaction(async (tx) => {
            if (normalizedItems !== undefined) {
                await tx.quotationItem.deleteMany({ where: { quotation_id: req.params.id } })
            }
            return tx.quotation.update({
                where: { quotation_id: req.params.id },
                data: {
                    ...(discount_amount !== undefined ? { discount_amount: Number(discount_amount) || 0 } : {}),
                    ...(normalizedItems !== undefined ? { items: { create: normalizedItems } } : {}),
                    updatedBy: req.user?.id
                },
                include: { items: true, client: true }
            })
        })

        return successResponse(res, withTotals(quotation), "Quotation Updated Successfully.")
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const deleteQuotation = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        const existing = await prisma.quotation.findUnique({ where: { quotation_id: req.params.id } })
        if (!existing || existing.tenant_id !== tenant_id) return errorResponse(res, "Quotation Not Found.", 404)
        if (existing.status === "CONFIRMED") return errorResponse(res, "This quotation has already been confirmed into a bill and can no longer be deleted.", 409)

        await prisma.quotation.update({
            where: { quotation_id: req.params.id },
            data: { isactive: false, updatedBy: req.user?.id }
        })
        return successResponse(res, null, "Quotation Deleted Successfully.")
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { createQuotation, getAllQuotations, getQuotationById, updateQuotation, deleteQuotation, downloadQuotationPdf }
