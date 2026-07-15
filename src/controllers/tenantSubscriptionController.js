const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")
const { getActiveSubscription, activateTrial: activateTrialForTenant, SubscriptionAccessError } = require("../utils/subscriptionAccess")

const computeExpiry = (plan, from = new Date()) => {
    if (plan.plan_type === "WALLET") return null
    const expiry = new Date(from)
    if (plan.duration_unit === "DAYS") expiry.setDate(expiry.getDate() + plan.duration_value)
    else if (plan.duration_unit === "MONTHS") expiry.setMonth(expiry.getMonth() + plan.duration_value)
    else if (plan.duration_unit === "YEARS") expiry.setFullYear(expiry.getFullYear() + plan.duration_value)
    return expiry
}

const buildSubscriptionSummary = async (tenant_id) => {
    const [subscription, wallet, tenant] = await Promise.all([
        getActiveSubscription(tenant_id),
        prisma.tenantWallet.findUnique({ where: { tenant_id } }),
        prisma.tenant.findUnique({ where: { tenant_id }, select: { trial_activated_at: true } })
    ])
    return { subscription, wallet, trial_activated_at: tenant?.trial_activated_at || null }
}

const formatDate = (date) => new Date(date).toISOString().slice(0, 10)

// Plans with a special-access cutoff are only usable by studios that joined before that date.
const assertPlanVisibleToTenant = (plan, tenant) => {
    if (!plan.special_access_cutoff_date) return
    if (new Date(tenant.createdAt) >= new Date(plan.special_access_cutoff_date)) {
        throw new Error(`This plan is only available to studios that joined before ${formatDate(plan.special_access_cutoff_date)}.`)
    }
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

        const [plan, tenant] = await Promise.all([
            prisma.subscriptionPlan.findUnique({ where: { subscription_plan_id } }),
            prisma.tenant.findUnique({ where: { tenant_id }, select: { createdAt: true } })
        ])
        if (!plan || !plan.isactive) return errorResponse(res, "Plan not found.", 404)

        try {
            assertPlanVisibleToTenant(plan, tenant)
        } catch (visibilityErr) {
            return errorResponse(res, visibilityErr.message, 403)
        }

        const now = new Date()

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
                    is_price_locked: true,
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

        const [plan, tenant] = await Promise.all([
            prisma.subscriptionPlan.findUnique({ where: { subscription_plan_id } }),
            prisma.tenant.findUnique({ where: { tenant_id }, select: { createdAt: true } })
        ])
        if (!plan || !plan.isactive || plan.plan_type !== "WALLET") {
            return errorResponse(res, "Invalid wallet recharge plan.", 400)
        }

        try {
            assertPlanVisibleToTenant(plan, tenant)
        } catch (visibilityErr) {
            return errorResponse(res, visibilityErr.message, 403)
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

const activateTrial = async (req, res) => {
    try {
        const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
        if (!loginRecord?.tenant_id) return errorResponse(res, "Only studio accounts can activate a trial.", 403)

        const subscription = await activateTrialForTenant(loginRecord.tenant_id)
        return successResponse(res, subscription, "Free Trial Activated Successfully.", 201)
    } catch (err) {
        if (err instanceof SubscriptionAccessError) return errorResponse(res, err.message, err.statusCode)
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { getMySubscription, getTenantSubscription, subscribeToPlan, rechargeWallet, activateTrial }
