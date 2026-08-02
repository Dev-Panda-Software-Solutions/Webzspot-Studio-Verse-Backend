const fs = require("fs")
const prisma = require("./prismaClient")
const s3Storage = require("./s3Storage")

// Fallback defaults — only used the very first time the platform settings
// singleton row is lazily created. After that, Super Admin can edit the
// live values via /api/platform-settings.
const TRIAL_DURATION_DAYS = 7
const TRIAL_PHOTO_QUOTA = 200
const MONTHLY_GRACE_DAYS = 3
const YEARLY_GRACE_DAYS = 12

class SubscriptionAccessError extends Error {
    constructor(message, statusCode = 403) {
        super(message)
        this.statusCode = statusCode
    }
}

// Singleton row — created with the defaults above on first access.
const getPlatformSettings = async () => {
    const existing = await prisma.platformSettings.findFirst()
    if (existing) return existing
    return prisma.platformSettings.create({
        data: {
            trial_duration_days: TRIAL_DURATION_DAYS,
            trial_photo_quota: TRIAL_PHOTO_QUOTA,
            createdBy: "SYSTEM"
        }
    })
}

const trialExpiryDate = (days, from = new Date()) => {
    const expiry = new Date(from)
    expiry.setDate(expiry.getDate() + days)
    return expiry
}

// Yearly plans get a longer grace window than monthly ones — everything else
// (trial, wallet-only, no plan) falls back to the monthly window.
const graceDaysForPlan = (plan, settings) => {
    if (plan?.duration_unit === "YEARS") return settings.yearly_grace_days
    return settings.monthly_grace_days
}

// Deletes every event/photo/video the tenant owns — called only once a
// subscription's grace period has fully lapsed with no renewal. Deliberately
// leaves the Tenant/Login/Users themselves intact (this purges their content,
// it does not delete the studio account).
const purgeTenantContent = async (tenant_id) => {
    const mappings = await prisma.eventTenantMapping.findMany({ where: { tenant_id }, select: { event_id: true } })
    const eventIds = mappings.map(m => m.event_id)
    if (eventIds.length === 0) return

    const mediaItems = await prisma.uploadedMedia.findMany({ where: { event_id: { in: eventIds } } })
    for (const media of mediaItems) {
        try {
            if (media.compressed_server_path && media.compressed_server_path !== media.media_server_path) {
                if (s3Storage.isS3Path(media.compressed_server_path)) await s3Storage.deleteObject(media.compressed_server_path)
                else if (fs.existsSync(media.compressed_server_path)) fs.unlinkSync(media.compressed_server_path)
            }
            if (media.media_server_path) {
                if (s3Storage.isS3Path(media.media_server_path)) await s3Storage.deleteObject(media.media_server_path)
                else if (fs.existsSync(media.media_server_path)) fs.unlinkSync(media.media_server_path)
            }
        } catch (e) {
            console.error(`[SubscriptionLifecycle] Failed to delete object for media ${media.media_id}:`, e.message)
        }
    }

    const mediaIds = mediaItems.map(m => m.media_id)
    await prisma.$transaction([
        prisma.userFavouriteMediaMapping.deleteMany({ where: { media_id: { in: mediaIds } } }),
        prisma.tenantFavouriteMediaMapping.deleteMany({ where: { event_id: { in: eventIds } } }),
        prisma.uploadedMedia.deleteMany({ where: { event_id: { in: eventIds } } }),
        prisma.mediaUploadStage.deleteMany({ where: { event_id: { in: eventIds } } }),
        prisma.eventUserMapping.deleteMany({ where: { event_id: { in: eventIds } } }),
        prisma.eventTenantMapping.deleteMany({ where: { event_id: { in: eventIds } } }),
        prisma.event.deleteMany({ where: { event_id: { in: eventIds } } }),
    ])
}

// Nothing flips a subscription's status on its own as time passes — this is
// the lazy sweep that does it, called from every path that reads a tenant's
// subscription. ACTIVE/TRIAL -> GRACE once the billing period ends; GRACE ->
// EXPIRED (+ full content purge) once the grace window itself lapses.
const evaluateSubscriptionLifecycle = async (subscription) => {
    if (!subscription || !subscription.expires_at) return subscription
    if (subscription.status === "EXPIRED" || subscription.status === "CANCELLED") return subscription

    const now = new Date()

    if (subscription.status === "GRACE") {
        if (!subscription.grace_ends_at || now <= new Date(subscription.grace_ends_at)) return subscription
        await purgeTenantContent(subscription.tenant_id)
        return prisma.tenantSubscription.update({
            where: { tenant_subscription_id: subscription.tenant_subscription_id },
            data: { status: "EXPIRED", isactive: false, updatedBy: "SYSTEM" },
            include: { plan: true }
        })
    }

    if (now <= new Date(subscription.expires_at)) return subscription

    const settings = await getPlatformSettings()
    const graceDays = graceDaysForPlan(subscription.plan, settings)
    const grace_ends_at = new Date(subscription.expires_at)
    grace_ends_at.setDate(grace_ends_at.getDate() + graceDays)

    return prisma.tenantSubscription.update({
        where: { tenant_subscription_id: subscription.tenant_subscription_id },
        data: { status: "GRACE", grace_ends_at, updatedBy: "SYSTEM" },
        include: { plan: true }
    })
}

const getActiveSubscription = async (tenant_id) => {
    const subscription = await prisma.tenantSubscription.findFirst({
        where: { tenant_id, isactive: true },
        include: { plan: true },
        orderBy: { starts_at: "desc" }
    })
    return evaluateSubscriptionLifecycle(subscription)
}

// getActiveSubscription is already lifecycle-evaluated (GRACE/EXPIRED are
// real, up-to-date status values by the time it returns), so this is now
// just a thin wrapper — kept for callers that only have a raw subscription
// object on hand (e.g. one already fetched in the same request).
const getEffectiveStatus = (subscription) => {
    if (!subscription) return null
    if (subscription.status === "CANCELLED") return "CANCELLED"
    if (subscription.status === "GRACE" || subscription.status === "EXPIRED") return subscription.status
    if (subscription.expires_at && new Date() > new Date(subscription.expires_at)) return "EXPIRED"
    return subscription.status
}

// The free trial is opt-in (see activateTrial below) — a tenant with no
// active subscription is a normal, expected state until they activate their
// trial or subscribe to a plan, so no auto-provisioning happens here.
const assertQuotaAvailable = async (tenant_id) => {
    const subscription = await getActiveSubscription(tenant_id)
    if (!subscription) {
        throw new SubscriptionAccessError("No active plan. Activate your free trial or subscribe to a plan to start uploading.", 403)
    }
    if (subscription.status === "GRACE") {
        throw new SubscriptionAccessError("Your subscription's billing period has ended. Uploads are disabled during the grace period — renew to continue uploading.", 403)
    }
    if (subscription.status === "EXPIRED") {
        throw new SubscriptionAccessError("Your subscription has expired and its content was removed. Subscribe to a plan to continue.", 403)
    }
    if (subscription.photo_quota_used >= subscription.photo_quota_total) {
        throw new SubscriptionAccessError("Your photo upload quota has been used up for this plan period.", 403)
    }
    return subscription
}

// One-time trial activation — a tenant may only ever activate the free trial
// once, tracked permanently via Tenant.trial_activated_at (independent of
// whether the resulting TenantSubscription later expires or gets replaced).
const activateTrial = async (tenant_id) => {
    const tenant = await prisma.tenant.findUnique({ where: { tenant_id }, select: { trial_activated_at: true } })
    if (tenant?.trial_activated_at) {
        throw new SubscriptionAccessError("You've already used your free trial.", 400)
    }

    const settings = await getPlatformSettings()
    const now = new Date()

    const [, , subscription] = await prisma.$transaction([
        prisma.tenant.update({ where: { tenant_id }, data: { trial_activated_at: now } }),
        prisma.tenantSubscription.updateMany({
            where: { tenant_id, isactive: true },
            data: { isactive: false, status: "CANCELLED" }
        }),
        prisma.tenantSubscription.create({
            data: {
                tenant_id,
                subscription_plan_id: null,
                status: "TRIAL",
                photo_quota_total: settings.trial_photo_quota,
                photo_quota_used: 0,
                starts_at: now,
                expires_at: trialExpiryDate(settings.trial_duration_days, now),
                createdBy: tenant_id
            }
        })
    ])
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
    MONTHLY_GRACE_DAYS,
    YEARLY_GRACE_DAYS,
    SubscriptionAccessError,
    getPlatformSettings,
    trialExpiryDate,
    graceDaysForPlan,
    getActiveSubscription,
    getEffectiveStatus,
    activateTrial,
    assertQuotaAvailable,
    consumeQuota,
    assertAiEventAllowed,
    deductAiCredits
}
