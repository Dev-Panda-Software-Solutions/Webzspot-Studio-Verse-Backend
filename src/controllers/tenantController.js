const bcrypt = require("bcryptjs")
const fs = require("fs")
const prisma = require("../utils/prismaClient")
const s3Storage = require("../utils/s3Storage")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")
const { activateTrial, getEffectiveStatus } = require("../utils/subscriptionAccess")

// Super admin's Create Studio form no longer collects a password (that's a
// studio-login concern, not a studio-creation concern) — when omitted, we
// mint a random one here and hand it back once so the super admin can share
// it with the studio owner; the owner can change it later from Settings.
const generateTempPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    let out = ''
    for (let i = 0; i < 12; i += 1) out += chars[Math.floor(Math.random() * chars.length)]
    return out
}

const createTenant = async (req, res) => {
    try {
        const { tenant_name, tenant_phone_number, tenant_email_id, tenant_studio_name, tenant_studio_address, profile_url, username, password, free_access_plan_id, free_access_until } = req.body

        const [existingLogin, existingTenant] = await Promise.all([
            prisma.login.findFirst({ where: { username } }),
            prisma.tenant.findFirst({ where: { tenant_email_id } })
        ])
        if (existingLogin) return errorResponse(res, 'Username already taken. Choose another.', 400)
        if (existingTenant) return errorResponse(res, 'Email already registered.', 400)

        const plainPassword = password || generateTempPassword()
        const hashedPassword = await bcrypt.hash(plainPassword, 10)

        // Optional Super Admin free grant: an existing plan handed out free
        // until a custom expiry (e.g. 6 or 12 months). A grant and an expiry
        // always travel together — a studio can never be created with an
        // expiry alone. When granted, the auto-trial below is skipped.
        let grantPlan = null
        let grantUntil = null
        if (free_access_plan_id || free_access_until) {
            if (!free_access_plan_id || !free_access_until) {
                return errorResponse(res, 'Free access requires both a plan and an expiry date.', 400)
            }
            grantPlan = await prisma.subscriptionPlan.findUnique({ where: { subscription_plan_id: free_access_plan_id } })
            if (!grantPlan || !grantPlan.isactive) return errorResponse(res, 'Free access plan not found.', 404)
            if (grantPlan.plan_type !== "SUBSCRIPTION") return errorResponse(res, 'Only subscription plans can be granted for free.', 400)
            grantUntil = new Date(free_access_until)
            if (isNaN(grantUntil.getTime()) || grantUntil <= new Date()) {
                return errorResponse(res, 'Free access must end in the future.', 400)
            }
        }

        const tenant = await prisma.tenant.create({
            data: { tenant_name, tenant_phone_number, tenant_email_id, tenant_studio_name, tenant_studio_address, profile_url, role: "ADMIN", createdBy: req.user?.id || "SYSTEM" }
        })

        await Promise.all([
            prisma.login.create({ data: { username, password_hash: hashedPassword, role: "ADMIN", tenant_id: tenant.tenant_id, createdBy: req.user?.id || "SYSTEM" } }),
            prisma.tenantSettings.create({ data: { tenant_id: tenant.tenant_id, createdBy: req.user?.id || "SYSTEM" } })
        ])

        if (grantPlan && grantUntil) {
            // Free grant replaces the auto-trial — plan free until the custom
            // expiry, recorded as a real subscription so quota/history work.
            await prisma.tenantSubscription.create({
                data: {
                    tenant_id: tenant.tenant_id,
                    subscription_plan_id: grantPlan.subscription_plan_id,
                    status: "ACTIVE",
                    change_type: "FREE_GRANT",
                    locked_price: 0,
                    is_price_locked: false,
                    is_free_grant: true,
                    photo_quota_total: grantPlan.photo_quota,
                    photo_quota_used: 0,
                    starts_at: new Date(),
                    expires_at: grantUntil,
                    createdBy: req.user?.id || "SYSTEM"
                }
            })
        } else {
            // Free trial is auto-granted on creation — no manual activation step.
            await activateTrial(tenant.tenant_id).catch(err => {
                console.error("[CreateTenant] Trial auto-activation failed:", err.message)
            })
        }

        // Only surface the generated password when we made one up — never
        // echo back a password the caller explicitly supplied.
        const responseData = password ? tenant : { ...tenant, generated_password: plainPassword }
        return successResponse(res, responseData, "Tenant Created Successfully.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getAllTenants = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
        const skip = (page - 1) * limit
        // status: "active" (default) | "archived" | "all"
        const status = req.query.status === "archived" ? false : req.query.status === "all" ? undefined : true
        const where = status === undefined ? {} : { isactive: status }
        const [rawItems, total] = await Promise.all([
            prisma.tenant.findMany({
                where, skip, take: limit, orderBy: { createdAt: 'desc' },
                include: {
                    tenant_subscriptions: {
                        where: { isactive: true },
                        orderBy: { starts_at: 'desc' },
                        take: 1,
                        include: { plan: true }
                    }
                }
            }),
            prisma.tenant.count({ where })
        ])
        // Flatten the latest active subscription onto each tenant and correct
        // its status for display (see getEffectiveStatus — the DB column
        // doesn't auto-flip to EXPIRED just because time passed).
        const items = rawItems.map(({ tenant_subscriptions, ...t }) => {
            const sub = tenant_subscriptions[0] || null
            return { ...t, subscription: sub ? { ...sub, status: getEffectiveStatus(sub) } : null }
        })
        return successResponse(res, { items, total, page, limit, pages: Math.ceil(total / limit) })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

// Users + events belonging to a studio — powers the Super Admin "studio
// detail" drill-down (Events page: click a studio to see how many clients
// and events it has, not just a flat list of every event on the platform).
// Also reports uploads still sitting in a staging state (never finalized)
// and the studio's total media files.
const getTenantSummary = async (req, res) => {
    try {
        const tenant_id = req.params.id
        const [tenant, userCount, eventCount, mappings] = await Promise.all([
            prisma.tenant.findUnique({ where: { tenant_id } }),
            prisma.user.count({ where: { created_by_tenant_id: tenant_id, isactive: true } }),
            prisma.eventTenantMapping.count({ where: { tenant_id, isactive: true } }),
            prisma.eventTenantMapping.findMany({ where: { tenant_id, isactive: true }, select: { event_id: true } })
        ])
        if (!tenant) return errorResponse(res, 'Tenant Not Found.', 404)

        const eventIds = mappings.map(m => m.event_id)
        const [pendingUploads, mediaCount] = eventIds.length > 0
            ? await Promise.all([
                  // Staged uploads that never became real media (no UploadedMedia linked).
                  prisma.mediaUploadStage.count({ where: { event_id: { in: eventIds }, isactive: true, uploaded_media: { is: null } } }),
                  prisma.uploadedMedia.count({ where: { event_id: { in: eventIds }, isactive: true } })
              ])
            : [0, 0]

        return successResponse(res, {
            tenant,
            user_count: userCount,
            event_count: eventCount,
            pending_uploads_count: pendingUploads,
            media_count: mediaCount
        })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

// Super Admin grants a studio a chosen existing plan FOR FREE until a custom
// expiry date (e.g. 6 or 12 months). Implemented as a real subscription row
// (locked_price 0, is_free_grant true) so quota tracking, billing history and
// the studio's own Billing page all see it naturally. A grant and an expiry
// always travel together — never an expiry alone.
const grantFreeAccess = async (req, res) => {
    try {
        const { subscription_plan_id, expires_at } = req.body
        if (!subscription_plan_id || !expires_at) {
            return errorResponse(res, "Free access requires both a plan (subscription_plan_id) and an expiry date (expires_at).", 400)
        }

        const plan = await prisma.subscriptionPlan.findUnique({ where: { subscription_plan_id } })
        if (!plan || !plan.isactive) return errorResponse(res, "Plan not found.", 404)
        if (plan.plan_type !== "SUBSCRIPTION") return errorResponse(res, "Only subscription plans can be granted for free.", 400)

        const until = new Date(expires_at)
        if (isNaN(until.getTime()) || until <= new Date()) {
            return errorResponse(res, "Free access must end in the future.", 400)
        }

        const now = new Date()
        const [, subscription] = await prisma.$transaction([
            // Any active trial/plan is superseded by the grant.
            prisma.tenantSubscription.updateMany({
                where: { tenant_id: req.params.id, isactive: true },
                data: { isactive: false, status: "CANCELLED", updatedBy: req.user?.id }
            }),
            prisma.tenantSubscription.create({
                data: {
                    tenant_id: req.params.id,
                    subscription_plan_id: plan.subscription_plan_id,
                    status: "ACTIVE",
                    change_type: "FREE_GRANT",
                    locked_price: 0,
                    is_price_locked: false,
                    is_free_grant: true,
                    photo_quota_total: plan.photo_quota,
                    photo_quota_used: 0,
                    starts_at: now,
                    expires_at: until,
                    createdBy: req.user?.id || "SYSTEM"
                }
            })
        ])

        return successResponse(res, { subscription, plan },
            `Free access granted — ${plan.plan_name} free until ${until.toISOString().slice(0, 10)}.`)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

// Revoke an active free grant — the studio's grant row is cancelled and it
// falls back to no plan (uploading requires a plan/trial again).
const revokeFreeAccess = async (req, res) => {
    try {
        const result = await prisma.tenantSubscription.updateMany({
            where: { tenant_id: req.params.id, isactive: true, is_free_grant: true },
            data: { isactive: false, status: "CANCELLED", updatedBy: req.user?.id }
        })
        if (result.count === 0) return errorResponse(res, "No active free access grant found.", 404)
        return successResponse(res, null, "Free access revoked.")
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

// Wipes every uploaded file (S3 objects + DB rows) belonging to a studio's
// events without touching the studio, its events, or its clients — lets a
// super admin reclaim storage from an abusive/inactive studio without
// deleting the account outright.
const deleteTenantStorage = async (req, res) => {
    try {
        const tenant_id = req.params.id
        const mappings = await prisma.eventTenantMapping.findMany({ where: { tenant_id }, select: { event_id: true } })
        const eventIds = mappings.map(m => m.event_id)
        if (eventIds.length === 0) return successResponse(res, { deleted_count: 0 }, 'No storage to delete.')

        const mediaItems = await prisma.uploadedMedia.findMany({ where: { event_id: { in: eventIds } } })
        if (mediaItems.length === 0) return successResponse(res, { deleted_count: 0 }, 'No storage to delete.')

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
                console.error(`[DeleteTenantStorage] Failed to delete object for media ${media.media_id}:`, e.message)
            }
        }

        const mediaIds = mediaItems.map(m => m.media_id)
        await prisma.$transaction([
            prisma.userFavouriteMediaMapping.deleteMany({ where: { media_id: { in: mediaIds } } }),
            prisma.tenantFavouriteMediaMapping.deleteMany({ where: { media_id: { in: mediaIds } } }),
            prisma.uploadedMedia.deleteMany({ where: { event_id: { in: eventIds } } }),
        ])

        return successResponse(res, { deleted_count: mediaItems.length }, `Deleted ${mediaItems.length} file${mediaItems.length === 1 ? '' : 's'}.`)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

// Super Admin reassigns a studio's plan — replaces whatever the studio is
// currently on (trial, free grant, or another plan) with a fresh subscription
// to the chosen plan. Used photo quota carries over so nothing uploaded is
// lost; the billing period restarts from now.
const computePlanExpiry = (plan, from = new Date()) => {
    const expiry = new Date(from)
    if (plan.duration_unit === "DAYS") expiry.setDate(expiry.getDate() + plan.duration_value)
    else if (plan.duration_unit === "MONTHS") expiry.setMonth(expiry.getMonth() + plan.duration_value)
    else if (plan.duration_unit === "YEARS") expiry.setFullYear(expiry.getFullYear() + plan.duration_value)
    return expiry
}

const setTenantPlan = async (req, res) => {
    try {
        const { subscription_plan_id } = req.body
        if (!subscription_plan_id) return errorResponse(res, "subscription_plan_id is required.", 400)

        const plan = await prisma.subscriptionPlan.findUnique({ where: { subscription_plan_id } })
        if (!plan || !plan.isactive) return errorResponse(res, "Plan not found.", 404)
        if (plan.plan_type !== "SUBSCRIPTION") return errorResponse(res, "Only subscription plans can be assigned.", 400)

        const current = await prisma.tenantSubscription.findFirst({
            where: { tenant_id: req.params.id, isactive: true },
            orderBy: { starts_at: "desc" }
        })

        const now = new Date()
        const [, subscription] = await prisma.$transaction([
            prisma.tenantSubscription.updateMany({
                where: { tenant_id: req.params.id, isactive: true },
                data: { isactive: false, status: "CANCELLED", updatedBy: req.user?.id }
            }),
            prisma.tenantSubscription.create({
                data: {
                    tenant_id: req.params.id,
                    subscription_plan_id: plan.subscription_plan_id,
                    status: "ACTIVE",
                    change_type: "ADMIN_SET",
                    locked_price: null,
                    is_price_locked: false,
                    photo_quota_total: plan.photo_quota,
                    photo_quota_used: current?.photo_quota_used ?? 0,
                    starts_at: now,
                    expires_at: computePlanExpiry(plan, now),
                    createdBy: req.user?.id || "SYSTEM"
                }
            })
        ])

        return successResponse(res, { subscription, plan },
            `Plan set to ${plan.plan_name} for this studio.`)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getTenantById = async (req, res) => {
    try {
        // ADMIN can only fetch their own tenant record
        if (req.user.role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            if (loginRecord?.tenant_id !== req.params.id) {
                return errorResponse(res, 'You can only view your own studio profile.', 403)
            }
        }
        const tenant = await prisma.tenant.findUnique({ where: { tenant_id: req.params.id } })
        if (!tenant) return errorResponse(res, 'Tenant Not Found.', 404)
        return successResponse(res, tenant)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const updateTenant = async (req, res) => {
    try {
        const [loginRecord, existing] = await Promise.all([
            req.user.role === "ADMIN" ? prisma.login.findUnique({ where: { transid: req.user?.id } }) : Promise.resolve(null),
            prisma.tenant.findUnique({ where: { tenant_id: req.params.id } })
        ])
        if (req.user.role === "ADMIN" && loginRecord?.tenant_id !== req.params.id) {
            return errorResponse(res, 'You can only update your own profile.', 403)
        }
        if (!existing) return errorResponse(res, 'Tenant Not Found.', 404)

        const { tenant_name, tenant_phone_number, tenant_email_id, tenant_studio_name, tenant_studio_address, profile_url } = req.body
        const tenant = await prisma.tenant.update({
            where: { tenant_id: req.params.id },
            data: { tenant_name, tenant_phone_number, tenant_email_id, tenant_studio_name, tenant_studio_address, profile_url, updatedBy: req.user?.id }
        })
        return successResponse(res, tenant, 'Tenant Updated Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const deleteTenant = async (req, res) => {
    try {
        await prisma.tenant.update({ where: { tenant_id: req.params.id }, data: { isactive: false, updatedBy: req.user?.id } })
        return successResponse(res, null, 'Tenant Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const hardDeleteTenant = async (req, res) => {
    try {
        const tenant_id = req.params.id
        // Every FK that points at this tenant must be cleared before the row can be
        // deleted. Clients (User) created by this tenant are kept — only the
        // ownership pointer is cleared, since client accounts may outlive the studio.
        await prisma.$transaction([
            prisma.user.updateMany({ where: { created_by_tenant_id: tenant_id }, data: { created_by_tenant_id: null } }),
            prisma.eventTenantMapping.deleteMany({ where: { tenant_id } }),
            prisma.tenantFavouriteMediaMapping.deleteMany({ where: { tenant_id } }),
            prisma.walletTransaction.deleteMany({ where: { tenant_id } }),
            prisma.tenantWallet.deleteMany({ where: { tenant_id } }),
            prisma.tenantSubscription.deleteMany({ where: { tenant_id } }),
            prisma.tenantSettings.deleteMany({ where: { tenant_id } }),
            prisma.login.deleteMany({ where: { tenant_id } }),
            prisma.tenant.delete({ where: { tenant_id } }),
        ])
        return successResponse(res, null, 'Tenant Permanently Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const restoreTenant = async (req, res) => {
    try {
        const tenant = await prisma.tenant.update({
            where: { tenant_id: req.params.id },
            data: { isactive: true, updatedBy: req.user?.id }
        })
        return successResponse(res, tenant, 'Studio Restored Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { createTenant, getAllTenants, getTenantById, getTenantSummary, grantFreeAccess, revokeFreeAccess, setTenantPlan, updateTenant, deleteTenant, hardDeleteTenant, restoreTenant, deleteTenantStorage }
