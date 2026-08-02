const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")

// The raiser's display name isn't on the JWT — look it up once from whichever
// parent record their Login points at, so ticket lists don't just show a raw
// login id to the Super Admin triaging the queue.
const resolveDisplayName = async (req) => {
    const { role } = req.user
    const loginRecord = req.loginRecord
    if (role === "SUPER_ADMIN") {
        const admin = await prisma.superAdmin.findUnique({ where: { super_admin_id: loginRecord.super_admin_id } })
        return admin?.super_admin_name || "Super Admin"
    }
    if (role === "ADMIN") {
        const tenant = await prisma.tenant.findUnique({ where: { tenant_id: loginRecord.tenant_id } })
        return tenant?.tenant_studio_name || tenant?.tenant_name || "Studio"
    }
    const user = await prisma.user.findUnique({ where: { user_id: loginRecord.user_id } })
    return user?.user_name || "Client"
}

const createTicket = async (req, res) => {
    try {
        const { subject, description } = req.body
        const raised_by_name = await resolveDisplayName(req)

        const ticket = await prisma.supportTicket.create({
            data: {
                subject,
                description,
                raised_by_role: req.user.role,
                raised_by_name,
                createdBy: req.user.id
            }
        })
        return successResponse(res, ticket, "Support Ticket Raised Successfully.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

// Any authenticated role sees only their own tickets here — Super Admin uses
// getAllTickets (below) for the platform-wide queue instead.
const getMyTickets = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20))
        const skip = (page - 1) * limit
        const where = { createdBy: req.user.id }

        const [items, total] = await Promise.all([
            prisma.supportTicket.findMany({
                where, skip, take: limit, orderBy: { createdAt: 'desc' },
                include: { replies: { orderBy: { createdAt: 'asc' } } }
            }),
            prisma.supportTicket.count({ where })
        ])
        return successResponse(res, { items, total, page, limit, pages: Math.ceil(total / limit) })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getAllTickets = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20))
        const skip = (page - 1) * limit
        const where = req.query.status ? { status: req.query.status } : {}

        const [items, total] = await Promise.all([
            prisma.supportTicket.findMany({
                where, skip, take: limit, orderBy: { createdAt: 'desc' },
                include: { replies: { orderBy: { createdAt: 'asc' } } }
            }),
            prisma.supportTicket.count({ where })
        ])
        return successResponse(res, { items, total, page, limit, pages: Math.ceil(total / limit) })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getTicketById = async (req, res) => {
    try {
        const ticket = await prisma.supportTicket.findUnique({
            where: { support_ticket_id: req.params.id },
            include: { replies: { orderBy: { createdAt: 'asc' } } }
        })
        if (!ticket) return errorResponse(res, 'Ticket Not Found.', 404)
        if (req.user.role !== "SUPER_ADMIN" && ticket.createdBy !== req.user.id) {
            return errorResponse(res, 'You do not have access to this ticket.', 403)
        }
        return successResponse(res, ticket)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

// Status is Super Admin-only — the raiser tracks status, they don't set it.
const updateTicketStatus = async (req, res) => {
    try {
        const { status } = req.body
        const ticket = await prisma.supportTicket.update({
            where: { support_ticket_id: req.params.id },
            data: { status, updatedBy: req.user.id }
        })
        return successResponse(res, ticket, "Ticket Status Updated Successfully.")
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const addReply = async (req, res) => {
    try {
        const { message } = req.body
        const ticket = await prisma.supportTicket.findUnique({ where: { support_ticket_id: req.params.id } })
        if (!ticket) return errorResponse(res, 'Ticket Not Found.', 404)
        if (req.user.role !== "SUPER_ADMIN" && ticket.createdBy !== req.user.id) {
            return errorResponse(res, 'You do not have access to this ticket.', 403)
        }

        const responder_name = await resolveDisplayName(req)
        const [reply] = await prisma.$transaction([
            prisma.supportTicketReply.create({
                data: {
                    support_ticket_id: req.params.id,
                    message,
                    responder_role: req.user.role,
                    responder_name,
                    createdBy: req.user.id
                }
            }),
            // A Super Admin reply on an OPEN ticket implicitly moves it forward —
            // the raiser shouldn't have to separately notice a reply landed on an
            // otherwise still-"Open"-looking ticket.
            ...(req.user.role === "SUPER_ADMIN" && ticket.status === "OPEN"
                ? [prisma.supportTicket.update({ where: { support_ticket_id: req.params.id }, data: { status: "IN_PROGRESS", updatedBy: req.user.id } })]
                : [])
        ])
        return successResponse(res, reply, "Reply Added Successfully.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { createTicket, getMyTickets, getAllTickets, getTicketById, updateTicketStatus, addReply }
