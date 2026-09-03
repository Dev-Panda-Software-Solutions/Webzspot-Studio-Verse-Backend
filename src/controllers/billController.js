const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")
const { resolveTenantId, claimNextNumber, computeItemsTotal, resolveClient } = require("../utils/billingAccess")
const { streamBillPdf } = require("../utils/billingPdf")
const { getActiveSubscription } = require("../utils/subscriptionAccess")

const withTotals = (bill) => {
    const items_total = computeItemsTotal(bill.items || [])
    const discount_amount = Number(bill.discount_amount || 0)
    const payable_amount = Math.max(0, items_total - discount_amount)
    const paid_amount = (bill.payments || []).reduce((sum, p) => sum + Number(p.amount), 0)
    const balance_due = Math.max(0, payable_amount - paid_amount)
    return { ...bill, client: resolveClient(bill), items_total, payable_amount, paid_amount, balance_due, receipt_count: (bill.payments || []).length }
}

// Confirming a Quotation is the only way a Bill comes into existence — its
// line items are copied across (not referenced), since a Bill is a fixed
// document from that point on: no item or discount edits, ever, only
// payments recorded against it.
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
                    user_id: quotation.user_id,
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
                include: { items: true, client: true, billing_client: true, quotation: true }
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
                include: { items: true, client: true, billing_client: true, quotation: { select: { quotation_number: true } }, payments: { where: { isactive: true } } }
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
                client: true,
                billing_client: true,
                quotation: { select: { quotation_id: true, quotation_number: true } },
                payments: { where: { isactive: true }, orderBy: { receipt_number: "asc" } }
            }
        })
        if (!bill || bill.tenant_id !== tenant_id) return errorResponse(res, "Bill Not Found.", 404)
        return successResponse(res, withTotals(bill))
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const downloadBillPdf = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        const bill = await prisma.bill.findUnique({
            where: { bill_id: req.params.id },
            include: {
                items: { orderBy: { createdAt: "asc" } },
                client: true,
                billing_client: true,
                tenant: true,
                payments: { where: { isactive: true }, orderBy: { receipt_number: "asc" } }
            }
        })
        if (!bill || bill.tenant_id !== tenant_id) return errorResponse(res, "Bill Not Found.", 404)

        const [settings, subscription] = await Promise.all([
            prisma.tenantSettings.findUnique({ where: { tenant_id } }),
            getActiveSubscription(tenant_id)
        ])
        const isTrial = subscription?.status === "TRIAL"

        return streamBillPdf(res, { tenant: bill.tenant, settings, bill: { ...bill, client: resolveClient(bill) }, isTrial })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { createBillFromQuotation, getAllBills, getBillById, downloadBillPdf }
