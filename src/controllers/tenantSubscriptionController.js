const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")
const { getActiveSubscription } = require("../utils/subscriptionAccess")

const computeExpiry = (plan, from = new Date()) => {
    if (plan.plan_type === "WALLET") return null
    const expiry = new Date(from)
    if (plan.duration_unit === "DAYS") expiry.setDate(expiry.getDate() + plan.duration_value)
    else if (plan.duration_unit === "MONTHS") expiry.setMonth(expiry.getMonth() + plan.duration_value)
    else if (plan.duration_unit === "YEARS") expiry.setFullYear(expiry.getFullYear() + plan.duration_value)
    return expiry
}

const buildSubscriptionSummary = async (tenant_id) => {
    const subscription = await getActiveSubscription(tenant_id)
    const wallet = await prisma.tenantWallet.findUnique({ where: { tenant_id } })
    return { subscription, wallet }
}

const getMySubscription = async (req, res) => {
    try {
        const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
        if (!loginRecord?.tenant_id) return errorResponse(res, "Only studio accounts have a subscription.", 403)
        const summary = await buildSubscriptionSummary(loginRecord.tenant_id)
        return successResponse(res, summary)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getTenantSubscription = async (req, res) => {
    try {
        const summary = await buildSubscriptionSummary(req.params.tenant_id)
        return successResponse(res, summary)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const subscribeToPlan = async (req, res) => {
    try {
        const { subscription_plan_id } = req.body
        if (!subscription_plan_id) return errorResponse(res, "subscription_plan_id is required.", 400)

        const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
        if (!loginRecord?.tenant_id) return errorResponse(res, "Only studio accounts can subscribe to a plan.", 403)
        const tenant_id = loginRecord.tenant_id

        const plan = await prisma.subscriptionPlan.findUnique({ where: { subscription_plan_id } })
        if (!plan || !plan.isactive) return errorResponse(res, "Plan not found.", 404)

        const now = new Date()
        const isWithinLockWindow = plan.launched_at && plan.price_lock_window_days > 0
            && now <= new Date(new Date(plan.launched_at).getTime() + plan.price_lock_window_days * 24 * 60 * 60 * 1000)

        const [, subscription] = await prisma.$transaction([
            prisma.tenantSubscription.updateMany({
                where: { tenant_id, isactive: true },
                data: { isactive: false, status: "CANCELLED", updatedBy: req.user?.id }
            }),
            prisma.tenantSubscription.create({
                data: {
                    tenant_id,
                    subscription_plan_id: plan.subscription_plan_id,
                    status: "ACTIVE",
                    locked_price: plan.price,
                    is_price_locked: Boolean(isWithinLockWindow),
                    photo_quota_total: plan.plan_type === "SUBSCRIPTION" ? plan.photo_quota : 0,
                    photo_quota_used: 0,
                    starts_at: now,
                    expires_at: computeExpiry(plan, now),
                    createdBy: req.user?.id || "SYSTEM"
                }
            })
        ])

        if (plan.plan_type === "WALLET") {
            await prisma.tenantWallet.upsert({
                where: { tenant_id },
                create: { tenant_id, balance_credits: 0, createdBy: req.user?.id || "SYSTEM" },
                update: {}
            })
        }

        return successResponse(res, subscription, "Subscribed Successfully.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const rechargeWallet = async (req, res) => {
    try {
        const { subscription_plan_id } = req.body
        if (!subscription_plan_id) return errorResponse(res, "subscription_plan_id is required.", 400)

        const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
        if (!loginRecord?.tenant_id) return errorResponse(res, "Only studio accounts can recharge a wallet.", 403)
        const tenant_id = loginRecord.tenant_id

        const plan = await prisma.subscriptionPlan.findUnique({ where: { subscription_plan_id } })
        if (!plan || !plan.isactive || plan.plan_type !== "WALLET") {
            return errorResponse(res, "Invalid wallet recharge plan.", 400)
        }

        const wallet = await prisma.tenantWallet.upsert({
            where: { tenant_id },
            create: { tenant_id, balance_credits: 0, createdBy: req.user?.id || "SYSTEM" },
            update: {}
        })

        const updatedWallet = await prisma.tenantWallet.update({
            where: { tenant_id },
            data: { balance_credits: { increment: plan.wallet_credits }, updatedBy: req.user?.id }
        })

        const transaction = await prisma.walletTransaction.create({
            data: {
                tenant_id,
                type: "RECHARGE",
                credits: plan.wallet_credits,
                balance_after: updatedWallet.balance_credits,
                reference: "MOCK_PAID",
                notes: `Recharge via plan ${plan.plan_name}`,
                createdBy: req.user?.id || "SYSTEM"
            }
        })

        return successResponse(res, { wallet: updatedWallet, transaction }, "Wallet Recharged Successfully.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { getMySubscription, getTenantSubscription, subscribeToPlan, rechargeWallet }
