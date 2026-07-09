const bcrypt = require("bcryptjs")
const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")
const { TRIAL_PHOTO_QUOTA, trialExpiryDate } = require("../utils/subscriptionAccess")

const createTenant = async (req, res) => {
    try {
        const { tenant_name, tenant_phone_number, tenant_email_id, tenant_studio_name, tenant_studio_address, profile_url, username, password } = req.body

        const [existingLogin, existingTenant] = await Promise.all([
            prisma.login.findFirst({ where: { username } }),
            prisma.tenant.findFirst({ where: { tenant_email_id } })
        ])
        if (existingLogin) return errorResponse(res, 'Username already taken. Choose another.', 400)
        if (existingTenant) return errorResponse(res, 'Email already registered.', 400)

        const hashedPassword = await bcrypt.hash(password, 10)

        const tenant = await prisma.tenant.create({
            data: { tenant_name, tenant_phone_number, tenant_email_id, tenant_studio_name, tenant_studio_address, profile_url, role: "ADMIN", createdBy: req.user?.id || "SYSTEM" }
        })

        await Promise.all([
            prisma.login.create({ data: { username, password_hash: hashedPassword, role: "ADMIN", tenant_id: tenant.tenant_id, createdBy: req.user?.id || "SYSTEM" } }),
            prisma.tenantSettings.create({ data: { tenant_id: tenant.tenant_id, createdBy: req.user?.id || "SYSTEM" } }),
            prisma.tenantSubscription.create({
                data: {
                    tenant_id: tenant.tenant_id,
                    subscription_plan_id: null,
                    status: "TRIAL",
                    photo_quota_total: TRIAL_PHOTO_QUOTA,
                    photo_quota_used: 0,
                    starts_at: new Date(),
                    expires_at: trialExpiryDate(),
                    createdBy: req.user?.id || "SYSTEM"
                }
            })
        ])

        return successResponse(res, tenant, "Tenant Created Successfully.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getAllTenants = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
        const skip = (page - 1) * limit
        const where = { isactive: true }
        const [items, total] = await Promise.all([
            prisma.tenant.findMany({ where, skip, take: limit }),
            prisma.tenant.count({ where })
        ])
        return successResponse(res, { items, total, page, limit, pages: Math.ceil(total / limit) })
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
        await prisma.tenant.delete({ where: { tenant_id: req.params.id } })
        return successResponse(res, null, 'Tenant Permanently Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { createTenant, getAllTenants, getTenantById, updateTenant, deleteTenant, hardDeleteTenant }
