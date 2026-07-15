const prisma = require("./prismaClient")

const TRIAL_DURATION_DAYS = 7
const TRIAL_PHOTO_QUOTA = 200

class SubscriptionAccessError extends Error {
    constructor(message, statusCode = 403) {
        super(message)
        this.statusCode = statusCode
    }
}

const trialExpiryDate = (from = new Date()) => {
    const expiry = new Date(from)
    expiry.setDate(expiry.getDate() + TRIAL_DURATION_DAYS)
    return expiry
}

const getActiveSubscription = async (tenant_id) => {
    return prisma.tenantSubscription.findFirst({
        where: { tenant_id, isactive: true },
        include: { plan: true },
        orderBy: { starts_at: "desc" }
    })
}

const assertQuotaAvailable = async (tenant_id) => {
    const subscription = await getActiveSubscription(tenant_id)
    if (!subscription) throw new SubscriptionAccessError("No active subscription found. Please subscribe to a plan.", 403)

    const now = new Date()
    if (subscription.expires_at && now > new Date(subscription.expires_at)) {
        throw new SubscriptionAccessError("Your subscription has expired. Please renew or choose a new plan.", 403)
    }
    if (subscription.photo_quota_used >= subscription.photo_quota_total) {
        throw new SubscriptionAccessError("Your photo upload quota has been used up for this plan period.", 403)
    }
    return subscription
}

const consumeQuota = async (tenant_id, count = 1) => {
    await prisma.tenantSubscription.updateMany({
        where: { tenant_id, isactive: true },
        data: { photo_quota_used: { increment: count } }
    })
}

// AI events are gated on wallet credits alone — a studio on ANY subscription
// plan (Basic, Pro, or Wallet) can use AI events as long as it has recharged
// its wallet at least once and carries a positive balance. The wallet is a
// feature add-on, not exclusive to tenants whose *active* plan happens to be
// the Wallet type.
const getAiCreditCostPerPhoto = async () => {
    const walletPlan = await prisma.subscriptionPlan.findFirst({
        where: { plan_type: "WALLET", isactive: true },
        orderBy: { display_order: "asc" }
    })
    return walletPlan?.ai_credit_cost_per_photo || 0
}

const assertAiEventAllowed = async (tenant_id) => {
    const wallet = await prisma.tenantWallet.findUnique({ where: { tenant_id } })
    if (!wallet || wallet.balance_credits <= 0) {
        throw new SubscriptionAccessError("Insufficient wallet credits. Please recharge your wallet.", 403)
    }
    return { wallet }
}

const deductAiCredits = async (tenant_id, photoCount, eventId) => {
    const costPerPhoto = await getAiCreditCostPerPhoto()
    const cost = costPerPhoto * photoCount
    if (cost <= 0) return null

    return prisma.$transaction(async (tx) => {
        const wallet = await tx.tenantWallet.findUnique({ where: { tenant_id } })
        if (!wallet || wallet.balance_credits < cost) {
            throw new SubscriptionAccessError("Insufficient wallet credits. Please recharge your wallet.", 403)
        }
        const updatedWallet = await tx.tenantWallet.update({
            where: { tenant_id },
            data: { balance_credits: { decrement: cost } }
        })
        const transaction = await tx.walletTransaction.create({
            data: {
                tenant_id,
                type: "AI_USAGE",
                credits: -cost,
                balance_after: updatedWallet.balance_credits,
                reference: eventId,
                createdBy: "SYSTEM"
            }
        })
        return transaction
    })
}

module.exports = {
    TRIAL_DURATION_DAYS,
    TRIAL_PHOTO_QUOTA,
    SubscriptionAccessError,
    trialExpiryDate,
    getActiveSubscription,
    assertQuotaAvailable,
    consumeQuota,
    assertAiEventAllowed,
    deductAiCredits
}
