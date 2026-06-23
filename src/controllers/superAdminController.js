const bcrypt = require("bcryptjs")
const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")

const createSuperAdmin = async (req, res) => {
    try {
        const { super_admin_name, super_admin_phone_number, super_admin_email_id, profile_url, username, password } = req.body

        if (!super_admin_name || !super_admin_email_id || !username || !password) {
            return errorResponse(res, 'name, email, username and password are required.', 400)
        }

        const existingLogin = await prisma.login.findFirst({ where: { username } })
        if (existingLogin) return errorResponse(res, 'Username already taken.', 400)

        const existingAdmin = await prisma.superAdmin.findFirst({ where: { super_admin_email_id } })
        if (existingAdmin) return errorResponse(res, 'Email already registered.', 400)

        const hashedPassword = await bcrypt.hash(password, 10)

        // role is always SUPER_ADMIN — never accept from body
        const superAdmin = await prisma.superAdmin.create({
            data: { super_admin_name, super_admin_phone_number, super_admin_email_id, profile_url, role: "SUPER_ADMIN", createdBy: req.user?.id || "SYSTEM" }
        })

        await prisma.login.create({
            data: { username, password_hash: hashedPassword, role: "SUPER_ADMIN", super_admin_id: superAdmin.super_admin_id, createdBy: req.user?.id || "SYSTEM" }
        })

        return successResponse(res, superAdmin, 'Super Admin Created Successfully.', 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getAllSuperAdmins = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
        const skip = (page - 1) * limit
        const where = { isactive: true }
        const [items, total] = await Promise.all([
            prisma.superAdmin.findMany({ where, skip, take: limit }),
            prisma.superAdmin.count({ where })
        ])
        return successResponse(res, { items, total, page, limit, pages: Math.ceil(total / limit) })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getSuperAdminById = async (req, res) => {
    try {
        const superAdmin = await prisma.superAdmin.findUnique({ where: { super_admin_id: req.params.id } })
        if (!superAdmin) return errorResponse(res, 'Super Admin Not Found.', 404)
        return successResponse(res, superAdmin)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const updateSuperAdmin = async (req, res) => {
    try {
        const { super_admin_name, super_admin_phone_number, super_admin_email_id, profile_url } = req.body
        const superAdmin = await prisma.superAdmin.update({
            where: { super_admin_id: req.params.id },
            data: { super_admin_name, super_admin_phone_number, super_admin_email_id, profile_url, updatedBy: req.user?.id }
        })
        return successResponse(res, superAdmin, 'Super Admin Updated Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const deleteSuperAdmin = async (req, res) => {
    try {
        await prisma.superAdmin.update({
            where: { super_admin_id: req.params.id },
            data: { isactive: false, updatedBy: req.user?.id }
        })
        return successResponse(res, null, 'Super Admin Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const hardDeleteSuperAdmin = async (req, res) => {
    try {
        await prisma.superAdmin.delete({ where: { super_admin_id: req.params.id } })
        return successResponse(res, null, 'Super Admin Permanently Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const unlockAccount = async (req, res) => {
    try {
        const { username } = req.body
        if (!username) return errorResponse(res, 'username is required.', 400)

        const loginRecord = await prisma.login.findFirst({ where: { username } })
        if (!loginRecord) return errorResponse(res, 'Username not found.', 404)

        await prisma.login.update({
            where: { transid: loginRecord.transid },
            data: { failed_login_attempts: 0, locked_until: null, updatedBy: req.user?.id }
        })

        return successResponse(res, null, `Account "${username}" has been unlocked successfully.`)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const resetAccountPassword = async (req, res) => {
    try {
        const { username, new_password } = req.body
        if (!username || !new_password) return errorResponse(res, 'username and new_password are required.', 400)
        if (new_password.length < 6) return errorResponse(res, 'New password must be at least 6 characters.', 400)

        const loginRecord = await prisma.login.findFirst({ where: { username } })
        if (!loginRecord) return errorResponse(res, 'Username not found.', 404)

        const hashedPassword = await bcrypt.hash(new_password, 10)
        await prisma.login.update({
            where: { transid: loginRecord.transid },
            data: { password_hash: hashedPassword, failed_login_attempts: 0, locked_until: null, updatedBy: req.user?.id }
        })

        return successResponse(res, null, `Password for "${username}" has been reset successfully.`)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { createSuperAdmin, getAllSuperAdmins, getSuperAdminById, updateSuperAdmin, deleteSuperAdmin, hardDeleteSuperAdmin, unlockAccount, resetAccountPassword }
