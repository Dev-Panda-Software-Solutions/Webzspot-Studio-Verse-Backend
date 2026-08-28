const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")
const { resolveTenantId, claimNextNumber, computeBillPayable } = require("../utils/billingAccess")
const { streamReceiptPdf } = require("../utils/billingPdf")

const PAYMENT_METHODS = ["CASH", "GPAY", "CARD", "BANK_TRANSFER", "CHEQUE"]

// Records one payment (= one receipt) against a Bill. Full payment or a
// split/partial one are the same operation — just call it more than once.
// Rejects amounts that would overpay the bill's remaining balance.
const createPayment = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        if (!tenant_id) return errorResponse(res, "Only studio accounts can record payments.", 403)

        const { bill_id, amount, method, remark } = req.body
        if (!bill_id) return errorResponse(res, "bill_id is required.", 400)
        const paymentAmount = Number(amount)
        if (!paymentAmount || paymentAmount <= 0) return errorResponse(res, "A valid payment amount is required.", 400)
        if (!PAYMENT_METHODS.includes(method)) return errorResponse(res, "A valid payment method is required.", 400)

        const bill = await prisma.bill.findUnique({
            where: { bill_id },
            include: { items: true, payments: { where: { isactive: true } } }
        })
        if (!bill || bill.tenant_id !== tenant_id) return errorResponse(res, "Bill Not Found.", 404)
        if (bill.status === "PAID") return errorResponse(res, "This bill is already fully paid.", 409)

        const payable = computeBillPayable(bill)
        const alreadyPaid = bill.payments.reduce((sum, p) => sum + Number(p.amount), 0)
        const remaining = payable - alreadyPaid
        if (paymentAmount > remaining + 0.01) {
            return errorResponse(res, `Payment exceeds the remaining balance of ₹${remaining.toFixed(2)}.`, 400)
        }

        const payment = await prisma.$transaction(async (tx) => {
            const receipt_number = await claimNextNumber(tx, tenant_id, "next_receipt_number")
            const created = await tx.payment.create({
                data: {
                    tenant_id,
                    bill_id,
                    receipt_number,
                    amount: paymentAmount,
                    method,
                    remark: remark?.trim() || null,
                    createdBy: req.user?.id
                }
            })

            const newPaidTotal = alreadyPaid + paymentAmount
            const newStatus = newPaidTotal >= payable - 0.01 ? "PAID" : "PARTIALLY_PAID"
            await tx.bill.update({ where: { bill_id }, data: { status: newStatus } })

            return created
        })

        return successResponse(res, payment, "Payment Recorded Successfully.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

// Tenant-wide payment feed — powers the Invoicing dashboard's revenue chart
// and recent-activity list (as opposed to getPaymentsForBill, which is
// scoped to one bill's receipt history).
const getAllPayments = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        if (!tenant_id) return errorResponse(res, "Only studio accounts can view payments.", 403)

        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
        const payments = await prisma.payment.findMany({
            where: { tenant_id, isactive: true },
            take: limit,
            orderBy: { createdAt: "desc" },
            include: { bill: { select: { bill_number: true, client: { select: { user_name: true } } } } }
        })
        return successResponse(res, payments)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getPaymentsForBill = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        const bill = await prisma.bill.findUnique({ where: { bill_id: req.params.billId } })
        if (!bill || bill.tenant_id !== tenant_id) return errorResponse(res, "Bill Not Found.", 404)

        const payments = await prisma.payment.findMany({
            where: { bill_id: req.params.billId, isactive: true },
            orderBy: { receipt_number: "asc" }
        })
        return successResponse(res, payments)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getPaymentById = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        const payment = await prisma.payment.findUnique({
            where: { payment_id: req.params.id },
            include: { bill: { include: { client: true, quotation: { select: { quotation_number: true } } } } }
        })
        if (!payment || payment.tenant_id !== tenant_id) return errorResponse(res, "Payment Not Found.", 404)
        return successResponse(res, payment)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const downloadReceiptPdf = async (req, res) => {
    try {
        const tenant_id = await resolveTenantId(req)
        const payment = await prisma.payment.findUnique({
            where: { payment_id: req.params.id },
            include: {
                tenant: true,
                bill: {
                    include: {
                        items: true,
                        client: true,
                        payments: { where: { isactive: true }, orderBy: { receipt_number: "asc" } }
                    }
                }
            }
        })
        if (!payment || payment.tenant_id !== tenant_id) return errorResponse(res, "Payment Not Found.", 404)

        const settings = await prisma.tenantSettings.findUnique({ where: { tenant_id } })
        const payable = computeBillPayable(payment.bill)
        // Sum only payments up to and including this receipt (by receipt_number)
        // so an older receipt still shows the balance as it stood at that time.
        const paidThroughThis = payment.bill.payments
            .filter(p => p.receipt_number <= payment.receipt_number)
            .reduce((sum, p) => sum + Number(p.amount), 0)
        const balanceAfter = Math.max(0, payable - paidThroughThis)

        return streamReceiptPdf(res, { tenant: payment.tenant, settings, payment, bill: payment.bill, balanceAfter })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { createPayment, getAllPayments, getPaymentsForBill, getPaymentById, downloadReceiptPdf }
