const path = require("path")
const prisma = require("../utils/prismaClient")
const s3Storage = require("../utils/s3Storage")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")

const UPLOADS_BASE = path.resolve(__dirname, "../../uploads")
const toUrlPath = (absPath) => `uploads/${path.relative(UPLOADS_BASE, absPath).replace(/\\/g, "/")}`

// Public — no auth. A guest scans the event's QR code, uploads a selfie, and
// leaves an email. No account/login is created. Face-matching against the
// AI Media gallery and the notification email are a later phase — this only
// captures the registration.
const registerGuest = async (req, res) => {
    try {
        const { event_id, guest_email } = req.body
        if (!event_id) return errorResponse(res, "event_id is required.", 400)
        if (!guest_email?.trim()) return errorResponse(res, "Email is required.", 400)
        if (!req.file) return errorResponse(res, "A selfie is required.", 400)

        const event = await prisma.event.findUnique({ where: { event_id }, select: { is_ai_event: true, isactive: true } })
        if (!event || !event.isactive) return errorResponse(res, "Event not found.", 404)
        if (!event.is_ai_event) return errorResponse(res, "This event isn't set up for AI Media guest registration.", 400)

        // Stored under S3 when configured, same as regular media, so guest
        // selfies aren't left sitting on local disk in production.
        let selfie_server_path
        if (s3Storage.isConfigured()) {
            const key = `events/${event_id}/guests/${path.basename(req.file.path)}`
            selfie_server_path = await s3Storage.uploadFile({ localPath: req.file.path, key, contentType: req.file.mimetype })
            require("fs").unlink(req.file.path, () => {})
        } else {
            selfie_server_path = toUrlPath(req.file.path)
        }

        const guest = await prisma.eventGuest.create({
            data: {
                event_id,
                guest_email: guest_email.trim(),
                selfie_server_path,
                createdBy: "GUEST"
            },
            select: { event_guest_id: true, guest_email: true, createdAt: true }
        })

        return successResponse(res, guest, "Registered! You'll receive your photos by email once the photographer publishes the event.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

// Studio-facing — list guests registered for one of their events.
const getGuestsByEvent = async (req, res) => {
    try {
        const { event_id } = req.params

        if (req.user.role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id, tenant_id: loginRecord?.tenant_id, isactive: true }
            })
            if (!access) return errorResponse(res, "You do not have access to this event.", 403)
        }

        const guests = await prisma.eventGuest.findMany({
            where: { event_id, isactive: true },
            orderBy: { createdAt: "desc" }
        })
        return successResponse(res, guests)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { registerGuest, getGuestsByEvent }
