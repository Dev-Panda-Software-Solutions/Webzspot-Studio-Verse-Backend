const prisma = require("./prismaClient")

// All billing endpoints are ADMIN-only (studio owners) — resolve their
// tenant_id from the login record rather than trusting the body/query.
const resolveTenantId = async (req) => {
    const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
    return loginRecord?.tenant_id || null
}

// Atomically claims the next number in a per-tenant sequence (quotation/bill
// /receipt) — increments the counter and returns the pre-increment value,
// inside the same transaction the caller uses to create the document, so two
// concurrent requests can never be handed the same number.
const claimNextNumber = async (tx, tenant_id, field) => {
    // upsert rather than a plain update — a tenant created before
    // TenantSettings existed (or any other edge case) shouldn't 500 here.
    const settings = await tx.tenantSettings.upsert({
        where: { tenant_id },
        update: { [field]: { increment: 1 } },
        create: { tenant_id, [field]: 2, createdBy: "SYSTEM" }
    })
    return settings[field] - 1
}

// Shared with billController and paymentController — a bill's payable amount
// must be computed identically everywhere a payment is validated against it.
const computeItemsTotal = (items) =>
    items.reduce((sum, i) => sum + (Number(i.price) - Number(i.discount_per_unit || 0)) * i.quantity, 0)

const computeBillPayable = (bill) =>
    Math.max(0, computeItemsTotal(bill.items || []) - Number(bill.discount_amount || 0))

module.exports = { resolveTenantId, claimNextNumber, computeItemsTotal, computeBillPayable }
