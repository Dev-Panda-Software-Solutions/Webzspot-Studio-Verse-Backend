const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")
const { resolveTenantId, claimNextNumber, computeItemsTotal } = require("../utils/billingAccess")

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

const withTotals = (bill) => {
    const items_total = computeItemsTotal(bill.items || [])
    const discount_amount = Number(bill.discount_amount || 0)
    const payable_amount = Math.max(0, items_total - discount_amount)
    const paid_amount = (bill.payments || []).reduce((sum, p) => sum + Number(p.amount), 0)
    const balance_due = Math.max(0, payable_amount - paid_amount)
    return { ...bill, items_total, payable_amount, paid_amount, balance_due }
}

// Confirming a Quotation is the only way a Bill comes into existence — its
// line items are copied across (not referenced) so the Bill can later be
// edited independently of the source Quotation.
const createBillFromQuotation = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        if (!tenant_id) return errorResponse(res, "Only studio accounts can create bills.", 403)

        const { quotation_id } = req.body
        if (!quotation_id) return errorResponse(res, "quotation_id is required.", 400)

        const quotation = await prisma.quotation.findUnique({
            where: { quotation_id },
            include: { items: true, bill: true }
        })
        if (!quotation || quotation.tenant_id !== tenant_id) return errorResponse(res, "Quotation Not Found.", 404)
        if (quotation.status === "CONFIRMED" || quotation.bill) return errorResponse(res, "This quotation has already been confirmed into a bill.", 409)
        if (quotation.items.length === 0) return errorResponse(res, "Cannot confirm an empty quotation.", 400)

        const bill = await prisma.$transaction(async (tx) => {
            const bill_number = await claimNextNumber(tx, tenant_id, "next_bill_number")
            const created = await tx.bill.create({
                data: {
                    tenant_id,
                    quotation_id,
                    billing_client_id: quotation.billing_client_id,
                    bill_number,
                    discount_amount: quotation.discount_amount,
                    createdBy: req.user?.id,
                    items: {
                        create: quotation.items.map(i => ({
                            name: i.name,
                            price: i.price,
                            quantity: i.quantity,
                            discount_per_unit: i.discount_per_unit
                        }))
                    }
                },
                include: { items: true, billing_client: true, quotation: true }
            })
            await tx.quotation.update({ where: { quotation_id }, data: { status: "CONFIRMED" } })
            return created
        })

        return successResponse(res, withTotals(bill), "Bill Created Successfully.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getAllBills = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        if (!tenant_id) return errorResponse(res, "Only studio accounts can view bills.", 403)

        const page = Math.max(1, parseInt(req.query.page) || 1)
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20))
        const skip = (page - 1) * limit
        const where = { tenant_id, isactive: true }

        const [rawItems, total] = await Promise.all([
            prisma.bill.findMany({
                where, skip, take: limit, orderBy: { bill_number: "desc" },
                include: { items: true, billing_client: true, quotation: { select: { quotation_number: true } }, payments: { where: { isactive: true } } }
            }),
            prisma.bill.count({ where })
        ])

        const items = rawItems.map(withTotals)
        return successResponse(res, { items, total, page, limit, pages: Math.ceil(total / limit) })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getBillById = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        const bill = await prisma.bill.findUnique({
            where: { bill_id: req.params.id },
            include: {
                items: { orderBy: { createdAt: "asc" } },
                billing_client: true,
                quotation: { select: { quotation_number: true } },
                payments: { where: { isactive: true }, orderBy: { receipt_number: "asc" } }
            }
        })
        if (!bill || bill.tenant_id !== tenant_id) return errorResponse(res, "Bill Not Found.", 404)
        return successResponse(res, withTotals(bill))
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

// Editable only while UNPAID — once Payments (Phase 3) exist against a bill,
// its amount must stay fixed so receipts always reconcile.
const updateBill = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        const existing = await prisma.bill.findUnique({ where: { bill_id: req.params.id } })
        if (!existing || existing.tenant_id !== tenant_id) return errorResponse(res, "Bill Not Found.", 404)
        if (existing.status !== "UNPAID") return errorResponse(res, "This bill already has payments recorded and can no longer be edited.", 409)

        const { items, discount_amount } = req.body
        const normalizedItems = items !== undefined ? normalizeItems(items) : undefined

        const bill = await prisma.$transaction(async (tx) => {
            if (normalizedItems !== undefined) {
                await tx.billItem.deleteMany({ where: { bill_id: req.params.id } })
            }
            return tx.bill.update({
                where: { bill_id: req.params.id },
                data: {
                    ...(discount_amount !== undefined ? { discount_amount: Number(discount_amount) || 0 } : {}),
                    ...(normalizedItems !== undefined ? { items: { create: normalizedItems } } : {}),
                    updatedBy: req.user?.id
                },
                include: { items: true, billing_client: true, quotation: { select: { quotation_number: true } } }
            })
        })

        return successResponse(res, withTotals(bill), "Bill Updated Successfully.")
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { createBillFromQuotation, getAllBills, getBillById, updateBill }
