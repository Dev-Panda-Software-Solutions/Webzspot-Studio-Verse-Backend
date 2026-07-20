const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const crypto = require("crypto")
const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")
const { addToBlocklist } = require("../utils/tokenBlocklist")

const envInt = (key, fallback) => {
    const value = Number.parseInt(process.env[key], 10)
    return Number.isFinite(value) && value > 0 ? value : fallback
}

const MAX_FAILED_ATTEMPTS = envInt("ACCOUNT_LOCK_MAX_FAILED_ATTEMPTS", 5)
const LOCK_DURATION_MINUTES = envInt("ACCOUNT_LOCK_DURATION_MINUTES", 5)
const LOCK_DURATION_MS = LOCK_DURATION_MINUTES * 60 * 1000

const login = async (req, res) => {
    try {
        const { username, password } = req.body

        let loginRecord = null
        if (username && username.includes("@")) {
            // Search all three entity types in parallel instead of sequentially
            const [tenant, user, superAdmin] = await Promise.all([
                prisma.tenant.findFirst({ where: { tenant_email_id: username, isactive: true } }),
                prisma.user.findFirst({ where: { user_email_id: username, isactive: true } }),
                prisma.superAdmin.findFirst({ where: { super_admin_email_id: username, isactive: true } }),
            ])
            const entity = tenant || user || superAdmin
            if (entity) {
                const where = tenant
                    ? { tenant_id: tenant.tenant_id }
                    : user
                    ? { user_id: user.user_id }
                    : { super_admin_id: superAdmin.super_admin_id }
                loginRecord = await prisma.login.findUnique({ where: { ...where, isactive: true } })
            }
        } else {
            loginRecord = await prisma.login.findFirst({ where: { username, isactive: true } })
        }

        if (!loginRecord) {
            await bcrypt.hash("dummy_timing_prevention", 10)
            return errorResponse(res, 'Invalid username or password.', 401)
        }

        // Archived Tenant/User must not be able to log back in, even via the plain
        // username path (only the email-lookup path above cross-checked this before).
        if (loginRecord.tenant_id) {
            const tenant = await prisma.tenant.findUnique({ where: { tenant_id: loginRecord.tenant_id }, select: { isactive: true } })
            if (!tenant || !tenant.isactive) {
                return errorResponse(res, 'This studio account has been deactivated. Please contact the platform administrator.', 403)
            }
        }

        if (loginRecord.user_id) {
            const user = await prisma.user.findUnique({ where: { user_id: loginRecord.user_id } })
            if (!user || !user.isactive) {
                return errorResponse(res, 'This account has been deactivated. Please contact your studio.', 403)
            }
            if (new Date() > new Date(user.expiry_date)) {
                return errorResponse(res, 'Your account has expired. Please contact your studio.', 403)
            }
        }

        if (loginRecord.locked_until && new Date() < new Date(loginRecord.locked_until)) {
            const remaining = Math.ceil((new Date(loginRecord.locked_until) - new Date()) / 1000)
            return errorResponse(res, `Account locked. Try again in ${remaining} seconds.`, 423)
        }

        const isMatch = await bcrypt.compare(password, loginRecord.password_hash)

        if (!isMatch) {
            const newFailCount = loginRecord.failed_login_attempts + 1
            const shouldLock = newFailCount >= MAX_FAILED_ATTEMPTS
            await prisma.login.update({
                where: { transid: loginRecord.transid },
                data: { failed_login_attempts: newFailCount, locked_until: shouldLock ? new Date(Date.now() + LOCK_DURATION_MS) : null }
            })
            if (shouldLock) return errorResponse(res, `Too many failed attempts. Account locked for ${LOCK_DURATION_MINUTES} minute${LOCK_DURATION_MINUTES === 1 ? "" : "s"}.`, 423)
            return errorResponse(res, `Invalid username or password. ${MAX_FAILED_ATTEMPTS - newFailCount} attempt(s) remaining before lockout.`, 401)
        }

        const jti = crypto.randomUUID()
        const token = jwt.sign({ id: loginRecord.transid, role: loginRecord.role, jti }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })

        await prisma.login.update({ where: { transid: loginRecord.transid }, data: { last_login_at: new Date(), failed_login_attempts: 0, locked_until: null } })

        const userPayload = {
            username: loginRecord.username,
            role: loginRecord.role,
            id: loginRecord.transid,
            super_admin_id: loginRecord.super_admin_id,
            tenant_id: loginRecord.tenant_id,
            user_id: loginRecord.user_id
        }

        if (loginRecord.role === 'ADMIN' && loginRecord.tenant_id) {
            const tenant = await prisma.tenant.findUnique({ where: { tenant_id: loginRecord.tenant_id } })
            if (tenant) {
                userPayload.tenant_studio_name = tenant.tenant_studio_name
                userPayload.tenant_name = tenant.tenant_name
                userPayload.tenant_email_id = tenant.tenant_email_id
                userPayload.tenant_phone_number = tenant.tenant_phone_number
                userPayload.profile_url = tenant.profile_url
            }
        } else if (loginRecord.role === 'USER' && loginRecord.user_id) {
            const user = await prisma.user.findUnique({ where: { user_id: loginRecord.user_id } })
            if (user) {
                userPayload.user_name = user.user_name
                userPayload.user_email_id = user.user_email_id
                userPayload.user_phone_number = user.user_phone_number
                userPayload.profile_url = user.profile_url
            }
        } else if (loginRecord.role === 'SUPER_ADMIN' && loginRecord.super_admin_id) {
            const superAdmin = await prisma.superAdmin.findUnique({ where: { super_admin_id: loginRecord.super_admin_id } })
            if (superAdmin) {
                userPayload.super_admin_name = superAdmin.super_admin_name
                userPayload.super_admin_email_id = superAdmin.super_admin_email_id
                userPayload.super_admin_phone_number = superAdmin.super_admin_phone_number
                userPayload.profile_url = superAdmin.profile_url
            }
        }

        return successResponse(res, { token, user: userPayload }, 'Login Successful')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const logout = async (req, res) => {
    try {
        const token = req.headers["authorization"]?.split(' ')[1]
        if (token) {
            const decoded = jwt.decode(token)
            if (decoded?.jti && decoded?.exp) await addToBlocklist(decoded.jti, decoded.exp * 1000)
        }
        return successResponse(res, null, 'Logged out successfully.')
    } catch (err) {
        return successResponse(res, null, 'Logged out.')
    }
}

const tenantSignup = async (req, res) => {
    try {
        const { tenant_name, tenant_phone_number, tenant_email_id, tenant_studio_name, tenant_studio_address, username, password } = req.body
        let { profile_url } = req.body
        // Only allow relative upload paths — reject javascript:, data:, http(s): etc.
        if (profile_url && !/^uploads\//.test(profile_url)) profile_url = null

        const [existingLogin, existingTenant] = await Promise.all([
            prisma.login.findFirst({ where: { username } }),
            prisma.tenant.findFirst({ where: { tenant_email_id } })
        ])
        if (existingLogin) return errorResponse(res, 'Username already taken. Choose another.', 400)
        if (existingTenant) return errorResponse(res, 'Email already registered.', 400)

        const hashedPassword = await bcrypt.hash(password, 10)

        const tenant = await prisma.tenant.create({
            data: { tenant_name, tenant_phone_number, tenant_email_id, tenant_studio_name, tenant_studio_address, profile_url, role: "ADMIN", createdBy: "SELF_SIGNUP" }
        })

        const loginRecord = await prisma.login.create({
            data: { username, password_hash: hashedPassword, role: "ADMIN", tenant_id: tenant.tenant_id, createdBy: "SELF_SIGNUP" }
        })

        await prisma.tenantSettings.create({ data: { tenant_id: tenant.tenant_id, createdBy: tenant.tenant_id } })

        // No subscription is created here — the free trial is opt-in. The tenant
        // activates it once from Billing (POST /api/billing/activate-trial).

        const jti = crypto.randomUUID()
        const token = jwt.sign({ id: loginRecord.transid, role: "ADMIN", jti }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })

        return successResponse(res, { tenant, token, role: "ADMIN" }, 'Signup Successful. Welcome to Webzspot Studio!', 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getMe = async (req, res) => {
    try {
        const loginId = req.user?.id
        const loginRecord = await prisma.login.findUnique({
            where: { transid: loginId },
            select: { transid: true, username: true, role: true, last_login_at: true, super_admin_id: true, tenant_id: true, user_id: true }
        })
        if (!loginRecord) return errorResponse(res, 'Account not found.', 404)

        let profile = null
        if (loginRecord.super_admin_id) {
            profile = await prisma.superAdmin.findUnique({ where: { super_admin_id: loginRecord.super_admin_id } })
        } else if (loginRecord.tenant_id) {
            profile = await prisma.tenant.findUnique({ where: { tenant_id: loginRecord.tenant_id } })
        } else if (loginRecord.user_id) {
            profile = await prisma.user.findUnique({ where: { user_id: loginRecord.user_id } })
        }

        return successResponse(res, { login: loginRecord, profile })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const changePassword = async (req, res) => {
    try {
        const { current_password, new_password } = req.body
        if (!current_password || !new_password) return errorResponse(res, 'current_password and new_password are required.', 400)
        if (new_password.length < 8) return errorResponse(res, 'New password must be at least 8 characters.', 400)
        if (current_password === new_password) return errorResponse(res, 'New password must be different from current password.', 400)

        const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
        if (!loginRecord) return errorResponse(res, 'Account not found.', 404)

        const isMatch = await bcrypt.compare(current_password, loginRecord.password_hash)
        if (!isMatch) return errorResponse(res, 'Current password is incorrect.', 401)

        const hashedPassword = await bcrypt.hash(new_password, 10)
        await prisma.login.update({ where: { transid: loginRecord.transid }, data: { password_hash: hashedPassword, updatedBy: loginRecord.transid } })

        const token = req.headers["authorization"]?.split(' ')[1]
        if (token) {
            const decoded = jwt.decode(token)
            if (decoded?.jti && decoded?.exp) await addToBlocklist(decoded.jti, decoded.exp * 1000)
        }

        return successResponse(res, null, 'Password changed successfully. Please log in again.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { login, logout, tenantSignup, getMe, changePassword }
