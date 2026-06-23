const bcrypt = require("bcryptjs")
const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")

const createUser = async (req, res) => {
    try {
        const { user_name, user_phone_number, user_email_id, validity_days, expiry_date, profile_url, username, password } = req.body

        const [existingLogin, existingEmail, loginRecord] = await Promise.all([
            prisma.login.findFirst({ where: { username } }),
            prisma.user.findFirst({ where: { user_email_id } }),
            prisma.login.findUnique({ where: { transid: req.user?.id } })
        ])
        if (existingLogin) return errorResponse(res, 'Username already taken. Choose another.', 400)
        if (existingEmail) return errorResponse(res, 'Email already registered.', 400)

        const hashedPassword = await bcrypt.hash(password, 10)
        const created_by_tenant_id = loginRecord?.tenant_id || null

        const user = await prisma.user.create({
            data: { user_name, user_phone_number, user_email_id, validity_days: String(validity_days ?? ''), expiry_date: new Date(expiry_date), profile_url, role: "USER", created_by_tenant_id, createdBy: req.user?.id || "SYSTEM" }
        })

        await prisma.login.create({
            data: { username, password_hash: hashedPassword, role: "USER", user_id: user.user_id, createdBy: req.user?.id || "SYSTEM" }
        })

        return successResponse(res, user, "User Created Successfully.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const createUserInEvent = async (req, res) => {
    try {
        const { user_name, user_phone_number, user_email_id, validity_days, expiry_date, profile_url, username, password, event_id } = req.body

        if (!event_id) return errorResponse(res, 'event_id is required.', 400)

        const [existingLogin, existingEmail, loginRecord] = await Promise.all([
            prisma.login.findFirst({ where: { username } }),
            prisma.user.findFirst({ where: { user_email_id } }),
            prisma.login.findUnique({ where: { transid: req.user?.id } })
        ])
        if (existingLogin) return errorResponse(res, 'Username already taken. Choose another.', 400)
        if (existingEmail) return errorResponse(res, 'Email already registered.', 400)

        const created_by_tenant_id = loginRecord?.tenant_id || null

        if (req.user.role === "ADMIN") {
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id, tenant_id: created_by_tenant_id, isactive: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        const user = await prisma.user.create({
            data: { user_name, user_phone_number, user_email_id, validity_days: String(validity_days ?? ''), expiry_date: new Date(expiry_date), profile_url, role: "USER", created_by_tenant_id, createdBy: req.user?.id || "SYSTEM" }
        })

        await Promise.all([
            prisma.login.create({ data: { username, password_hash: hashedPassword, role: "USER", user_id: user.user_id, createdBy: req.user?.id || "SYSTEM" } }),
            prisma.eventUserMapping.create({ data: { event_id, user_id: user.user_id, createdBy: req.user?.id || "SYSTEM" } })
        ])

        return successResponse(res, user, "User Created and Mapped to Event Successfully.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getAllUsers = async (req, res) => {
    try {
        const { role, id: loginId } = req.user
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
        const skip = (page - 1) * limit

        let where = { isactive: true }

        if (role !== "SUPER_ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: loginId } })
            where.created_by_tenant_id = loginRecord?.tenant_id
        }

        const [items, total] = await Promise.all([
            prisma.user.findMany({ where, skip, take: limit }),
            prisma.user.count({ where })
        ])

        return successResponse(res, { items, total, page, limit, pages: Math.ceil(total / limit) })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getUserById = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { user_id: req.params.id } })
        if (!user) return errorResponse(res, 'User Not Found.', 404)

        if (req.user.role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            if (user.created_by_tenant_id !== loginRecord?.tenant_id) {
                return errorResponse(res, 'You can only view users you created.', 403)
            }
        }

        return successResponse(res, user)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const updateUser = async (req, res) => {
    try {
        const [existing, loginRecord] = await Promise.all([
            prisma.user.findUnique({ where: { user_id: req.params.id } }),
            req.user.role === "ADMIN" ? prisma.login.findUnique({ where: { transid: req.user?.id } }) : Promise.resolve(null)
        ])
        if (!existing) return errorResponse(res, 'User Not Found.', 404)
        if (req.user.role === "ADMIN" && existing.created_by_tenant_id !== loginRecord?.tenant_id) {
            return errorResponse(res, 'You can only update users you created.', 403)
        }

        const { user_name, user_phone_number, user_email_id, validity_days, expiry_date, profile_url } = req.body
        const user = await prisma.user.update({
            where: { user_id: req.params.id },
            data: { user_name, user_phone_number, user_email_id, validity_days, expiry_date: expiry_date ? new Date(expiry_date) : undefined, profile_url, updatedBy: req.user?.id }
        })
        return successResponse(res, user, 'User Updated Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const deleteUser = async (req, res) => {
    try {
        const [existing, loginRecord] = await Promise.all([
            prisma.user.findUnique({ where: { user_id: req.params.id } }),
            req.user.role === "ADMIN" ? prisma.login.findUnique({ where: { transid: req.user?.id } }) : Promise.resolve(null)
        ])
        if (!existing) return errorResponse(res, 'User Not Found.', 404)
        if (req.user.role === "ADMIN" && existing.created_by_tenant_id !== loginRecord?.tenant_id) {
            return errorResponse(res, 'You can only delete users you created.', 403)
        }

        await prisma.user.update({ where: { user_id: req.params.id }, data: { isactive: false, updatedBy: req.user?.id } })
        return successResponse(res, null, 'User Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const hardDeleteUser = async (req, res) => {
    try {
        const [existing, loginRecord] = await Promise.all([
            prisma.user.findUnique({ where: { user_id: req.params.id } }),
            req.user.role === "ADMIN" ? prisma.login.findUnique({ where: { transid: req.user?.id } }) : Promise.resolve(null)
        ])
        if (!existing) return errorResponse(res, 'User Not Found.', 404)
        if (req.user.role === "ADMIN" && existing.created_by_tenant_id !== loginRecord?.tenant_id) {
            return errorResponse(res, 'You can only permanently delete users you created.', 403)
        }

        await prisma.user.delete({ where: { user_id: req.params.id } })
        return successResponse(res, null, 'User Permanently Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { createUser, createUserInEvent, getAllUsers, getUserById, updateUser, deleteUser, hardDeleteUser }
