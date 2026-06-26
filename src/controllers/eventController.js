const path = require("path")
const fs = require("fs")
const prisma = require("../utils/prismaClient")
const s3Storage = require("../utils/s3Storage")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")

const UPLOADS_DIR = path.resolve(__dirname, "../../uploads")

const createEvent = async (req, res) => {
    try {
        const {
            event_name, event_description, event_date, event_time, event_venue,
            event_organizer, event_organizer_phone_number, event_organizer_email_id,
            profile_url, user_ids
        } = req.body

        const event = await prisma.event.create({
            data: {
                event_name, event_description,
                event_date: event_date ? new Date(event_date) : null,
                event_time, event_venue, event_organizer,
                event_organizer_phone_number, event_organizer_email_id,
                profile_url, createdBy: req.user?.id || "SYSTEM"
            }
        })

        const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
        if (loginRecord?.tenant_id) {
            await prisma.eventTenantMapping.create({
                data: { event_id: event.event_id, tenant_id: loginRecord.tenant_id, collaboration_role: "OWNER", createdBy: req.user?.id || "SYSTEM" }
            })
        }

        if (user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
            // ADMIN can only map users they created
            let validUserIds = user_ids
            if (req.user.role === "ADMIN" && loginRecord?.tenant_id) {
                const ownedUsers = await prisma.user.findMany({
                    where: { user_id: { in: user_ids }, created_by_tenant_id: loginRecord.tenant_id, isactive: true },
                    select: { user_id: true }
                })
                validUserIds = ownedUsers.map(u => u.user_id)
            }
            if (validUserIds.length > 0) {
                const userMappings = validUserIds.map(user_id => ({
                    event_id: event.event_id, user_id, createdBy: req.user?.id || "SYSTEM"
                }))
                await prisma.eventUserMapping.createMany({ data: userMappings })
            }
        }

        return successResponse(res, event, "Event Created Successfully.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getAllEvents = async (req, res) => {
    try {
        const { role, id: loginId } = req.user
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
        const skip = (page - 1) * limit

        if (role === "SUPER_ADMIN") {
            const where = { isactive: true }
            const [rawItems, total] = await Promise.all([
                prisma.event.findMany({
                    where, skip, take: limit, orderBy: { createdAt: 'desc' },
                    include: {
                        tenant_mapping: {
                            where: { collaboration_role: 'OWNER', isactive: true },
                            include: { tenant: { select: { tenant_id: true, tenant_studio_name: true } } },
                            take: 1
                        }
                    }
                }),
                prisma.event.count({ where })
            ])
            const items = rawItems.map(e => ({
                ...e,
                owner_studio: e.tenant_mapping[0]?.tenant || null,
                tenant_mapping: undefined
            }))
            return successResponse(res, { items, total, page, limit, pages: Math.ceil(total / limit) })
        }

        if (role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: loginId } })
            const where = { tenant_id: loginRecord?.tenant_id, isactive: true, event: { isactive: true } }
            const [mappings, total] = await Promise.all([
                prisma.eventTenantMapping.findMany({ where, include: { event: true }, skip, take: limit, orderBy: { createdAt: 'desc' } }),
                prisma.eventTenantMapping.count({ where })
            ])
            return successResponse(res, { items: mappings.map(m => m.event), total, page, limit, pages: Math.ceil(total / limit) })
        }

        const loginRecord = await prisma.login.findUnique({ where: { transid: loginId } })
        const now = new Date()
        const where = {
            user_id: loginRecord?.user_id,
            isactive: true,
            event: { isactive: true },
        }
        // Explicit select intentionally excludes access_expires — that column may not exist yet
        // in the DB if the migration hasn't run. All events default to has_current_access: true.
        // Once the migration runs and the column exists, add access_expires: true here.
        const [mappings, total] = await Promise.all([
            prisma.eventUserMapping.findMany({
                where,
                select: {
                    event_user_id: true,
                    event_id: true,
                    user_id: true,
                    isactive: true,
                    createdAt: true,
                    event: true,
                },
                skip, take: limit, orderBy: { createdAt: 'desc' }
            }),
            prisma.eventUserMapping.count({ where })
        ])
        const items = mappings.map(m => ({
            ...m.event,
            _access: {
                event_user_id: m.event_user_id,
                access_expires: null,
                has_current_access: true,
            }
        }))
        return successResponse(res, { items, total, page, limit, pages: Math.ceil(total / limit) })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getEventById = async (req, res) => {
    try {
        const { role, id: loginId } = req.user
        const { id: event_id } = req.params

        if (role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: loginId } })
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id, tenant_id: loginRecord?.tenant_id, isactive: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        if (role === "USER") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: loginId } })
            // Use explicit select to avoid selecting access_expires if the column hasn't been migrated yet
            const access = await prisma.eventUserMapping.findFirst({
                where: { event_id, user_id: loginRecord?.user_id, isactive: true },
                select: { event_user_id: true }
            })
            if (!access) return errorResponse(res, 'You do not have access to this event.', 403)
        }

        // All roles: limit fields exposed on related models — never expose phone/email/expiry of others to USER
        const event = await prisma.event.findUnique({
            where: { event_id },
            include: {
                tenant_mapping: role !== "USER" ? {
                    where: { isactive: true },
                    select: {
                        event_tenant_mapping_id: true,
                        collaboration_role: true,
                        tenant: { select: { tenant_id: true, tenant_name: true, tenant_studio_name: true } }
                    }
                } : false,
                user_mapping: role !== "USER" ? {
                    where: { isactive: true },
                    select: {
                        event_user_id: true,
                        user: { select: { user_id: true, user_name: true } }
                    }
                } : false,
                uploaded_media: {
                    where: { isactive: true },
                    select: { media_id: true, media_name: true, media_type: true, media_size: true, original_size: true }
                }
            }
        })
        if (!event) return errorResponse(res, "Event Not Found.", 404)
        return successResponse(res, event)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const updateEvent = async (req, res) => {
    try {
        const { id: event_id } = req.params

        if (req.user.role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id, tenant_id: loginRecord?.tenant_id, collaboration_role: { in: ["OWNER", "EDITOR"] }, isactive: true }
            })
            if (!access) return errorResponse(res, 'Only the event OWNER or EDITOR can update this event.', 403)
        }

        const { event_name, event_description, event_date, event_time, event_venue, event_organizer, event_organizer_phone_number, event_organizer_email_id, profile_url } = req.body
        const event = await prisma.event.update({
            where: { event_id },
            data: {
                event_name, event_description,
                event_date: event_date ? new Date(event_date) : undefined,
                event_time, event_venue, event_organizer,
                event_organizer_phone_number, event_organizer_email_id,
                profile_url, updatedBy: req.user?.id
            }
        })
        return successResponse(res, event, 'Event Updated Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const deleteEvent = async (req, res) => {
    try {
        const { id: event_id } = req.params

        if (req.user.role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id, tenant_id: loginRecord?.tenant_id, collaboration_role: "OWNER", isactive: true }
            })
            if (!access) return errorResponse(res, 'Only the event OWNER can delete this event.', 403)
        }

        const updatedBy = req.user?.id
        await prisma.$transaction([
            prisma.event.update({ where: { event_id }, data: { isactive: false, updatedBy } }),
            prisma.eventTenantMapping.updateMany({ where: { event_id }, data: { isactive: false, updatedBy } }),
            prisma.eventUserMapping.updateMany({ where: { event_id }, data: { isactive: false, updatedBy } }),
            prisma.uploadedMedia.updateMany({ where: { event_id }, data: { isactive: false, updatedBy } }),
            prisma.mediaUploadStage.updateMany({ where: { event_id }, data: { isactive: false, updatedBy } }),
            prisma.userFavouriteMediaMapping.updateMany({ where: { event_id }, data: { isactive: false, updatedBy } }),
        ])
        return successResponse(res, null, 'Event and all related records deleted successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const hardDeleteEvent = async (req, res) => {
    try {
        const { id: event_id } = req.params

        if (req.user.role === "ADMIN") {
            const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
            const access = await prisma.eventTenantMapping.findFirst({
                where: { event_id, tenant_id: loginRecord?.tenant_id, collaboration_role: "OWNER", isactive: true }
            })
            if (!access) return errorResponse(res, 'Only the event OWNER can permanently delete this event.', 403)
        }

        // Delete all physical media files associated with this event before removing DB records
        const mediaFiles = await prisma.uploadedMedia.findMany({
            where: { event_id },
            select: { media_server_path: true, compressed_server_path: true }
        })
        await prisma.event.delete({ where: { event_id } })

        // Best-effort file cleanup — non-blocking, errors logged but not surfaced to caller
        for (const m of mediaFiles) {
            for (const filePath of [m.media_server_path, m.compressed_server_path]) {
                if (!filePath) continue
                if (s3Storage.isS3Path(filePath)) {
                    s3Storage.deleteObject(filePath).catch(err => console.error('[Event delete] S3 delete error:', err.message))
                    continue
                }
                const resolved = path.resolve(filePath)
                if (resolved.startsWith(UPLOADS_DIR)) {
                    fs.unlink(resolved, err => { if (err && err.code !== 'ENOENT') console.error('[Event delete] unlink error:', err.message) })
                }
            }
        }

        return successResponse(res, null, 'Event Permanently Deleted Successfully.')
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getEventStats = async (req, res) => {
    try {
        const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })

        let eventIds
        if (req.user.role === "SUPER_ADMIN") {
            const events = await prisma.event.findMany({ where: { isactive: true }, select: { event_id: true } })
            eventIds = events.map(e => e.event_id)
        } else {
            const mappings = await prisma.eventTenantMapping.findMany({
                where: { tenant_id: loginRecord?.tenant_id, isactive: true },
                select: { event_id: true }
            })
            eventIds = mappings.map(m => m.event_id)
        }

        const [media, clients, userFavs, tenantFavs] = await Promise.all([
            prisma.uploadedMedia.count({ where: { event_id: { in: eventIds }, isactive: true } }),
            prisma.eventUserMapping.count({ where: { event_id: { in: eventIds }, isactive: true } }),
            prisma.userFavouriteMediaMapping.count({ where: { event_id: { in: eventIds }, isactive: true } }),
            loginRecord?.tenant_id
                ? prisma.tenantFavouriteMediaMapping.count({ where: { event_id: { in: eventIds }, tenant_id: loginRecord.tenant_id, isactive: true } })
                : Promise.resolve(0)
        ])

        return successResponse(res, { events: eventIds.length, media, clients, favourites: userFavs + tenantFavs })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}


// ─── Analytics endpoint for Studio / SuperAdmin dashboard charts ───────────────
const getDashboardAnalytics = async (req, res) => {
    try {
        const loginRecord = await prisma.login.findUnique({ where: { transid: req.user?.id } })
        const isSuperAdmin = req.user.role === 'SUPER_ADMIN'

        // Resolve event IDs scoped to this tenant (or all for super admin)
        let eventIds
        if (isSuperAdmin) {
            const events = await prisma.event.findMany({ where: { isactive: true }, select: { event_id: true } })
            eventIds = events.map(e => e.event_id)
        } else {
            const mappings = await prisma.eventTenantMapping.findMany({
                where: { tenant_id: loginRecord?.tenant_id, isactive: true },
                select: { event_id: true }
            })
            eventIds = mappings.map(m => m.event_id)
        }

        const sixMonthsAgo = new Date()
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
        sixMonthsAgo.setDate(1)
        sixMonthsAgo.setHours(0, 0, 0, 0)

        // Fetch raw data for grouping
        const [allEvents, recentMedia, allClients, allFavs, topEventsRaw, totalMediaCount, storedMedia, scopedEvents, tenantMappings, userMappings] = await Promise.all([
            // Events created in last 6 months (for chart)
            prisma.event.findMany({
                where: { event_id: { in: eventIds }, createdAt: { gte: sixMonthsAgo } },
                select: { event_id: true, createdAt: true, isactive: true }
            }),

            // Media uploaded in last 6 months (for chart)
            prisma.uploadedMedia.findMany({
                where: { event_id: { in: eventIds }, isactive: true, createdAt: { gte: sixMonthsAgo } },
                select: { media_id: true, createdAt: true, event_id: true }
            }),

            // Total clients (all time)
            prisma.eventUserMapping.count({ where: { event_id: { in: eventIds }, isactive: true } }),

            // Total favourites (all time)
            prisma.userFavouriteMediaMapping.count({ where: { event_id: { in: eventIds }, isactive: true } }),

            // Top events by media count (all time)
            prisma.uploadedMedia.groupBy({
                by: ['event_id'],
                where: { event_id: { in: eventIds }, isactive: true },
                _count: { media_id: true },
                orderBy: { _count: { media_id: 'desc' } },
                take: 6,
            }),

            // Total media count (all time)
            prisma.uploadedMedia.count({ where: { event_id: { in: eventIds }, isactive: true } }),

            // Storage size source (all time)
            prisma.uploadedMedia.findMany({
                where: { event_id: { in: eventIds }, isactive: true },
                select: {
                    event_id: true,
                    media_size: true,
                    original_size: true,
                    media_server_path: true,
                    compressed_server_path: true
                }
            }),

            prisma.event.findMany({
                where: { event_id: { in: eventIds } },
                select: {
                    event_id: true,
                    event_name: true,
                }
            }),

            prisma.eventTenantMapping.findMany({
                where: { event_id: { in: eventIds }, isactive: true },
                select: {
                    event_id: true,
                    tenant_id: true,
                }
            }),

            prisma.eventUserMapping.findMany({
                where: { event_id: { in: eventIds }, isactive: true },
                select: {
                    event_id: true,
                    user_id: true,
                }
            }),
        ])

        const allMedia = recentMedia

        // ── Month labels for the last 6 months ─────────────────────────────────
        const months = []
        for (let i = 5; i >= 0; i--) {
            const d = new Date()
            d.setMonth(d.getMonth() - i)
            months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
        }

        const toKey = (date) => {
            const d = new Date(date)
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        }

        // Events per month
        const eventsMap = Object.fromEntries(months.map(m => [m, 0]))
        for (const e of allEvents) eventsMap[toKey(e.createdAt)] = (eventsMap[toKey(e.createdAt)] || 0) + 1
        const events_by_month = months.map(m => ({ month: m, count: eventsMap[m] }))

        // Media per month
        const mediaMap = Object.fromEntries(months.map(m => [m, 0]))
        for (const m of allMedia) mediaMap[toKey(m.createdAt)] = (mediaMap[toKey(m.createdAt)] || 0) + 1
        const media_by_month = months.map(m => ({ month: m, count: mediaMap[m] }))

        // Media per event (for event filter)
        const mediaByEvent = {}
        for (const m of allMedia) {
            mediaByEvent[m.event_id] = (mediaByEvent[m.event_id] || 0) + 1
        }

        // Resolve event names for top events
        const topEventIds = topEventsRaw.map(t => t.event_id)
        const topEventDetails = await prisma.event.findMany({
            where: { event_id: { in: topEventIds } },
            select: { event_id: true, event_name: true }
        })
        const nameMap = Object.fromEntries(topEventDetails.map(e => [e.event_id, e.event_name]))

        const top_events = topEventsRaw.map(t => ({
            event_id: t.event_id,
            event_name: nameMap[t.event_id] || 'Unknown',
            media_count: t._count.media_id,
        }))

        const parseSizeToKb = (value) => {
            if (!value) return 0
            const text = String(value).trim()
            const match = text.match(/^([\d.]+)\s*([a-zA-Z]*)/)
            const amount = Number.parseFloat(match?.[1])
            if (!Number.isFinite(amount)) return 0
            const unit = (match?.[2] || 'kb').toLowerCase()
            if (unit.startsWith('gb')) return amount * 1024 * 1024
            if (unit.startsWith('mb')) return amount * 1024
            if (unit.startsWith('b') && !unit.startsWith('kb')) return amount / 1024
            return amount
        }

        const eventStorageMap = new Map()
        for (const media of storedMedia) {
            const originalKb = parseSizeToKb(media.original_size || media.media_size)
            const compressedKb = parseSizeToKb(media.media_size)
            const storesSeparateCompressed = media.compressed_server_path && media.compressed_server_path !== media.media_server_path
            const storedKb = originalKb + (storesSeparateCompressed ? compressedKb : 0)
            const current = eventStorageMap.get(media.event_id) || { original_kb: 0, compressed_kb: 0, stored_kb: 0, media_count: 0 }
            current.original_kb += originalKb
            current.compressed_kb += storesSeparateCompressed ? compressedKb : 0
            current.stored_kb += storedKb
            current.media_count += 1
            eventStorageMap.set(media.event_id, current)
        }

        const eventDetailsMap = new Map(scopedEvents.map(e => [e.event_id, e]))
        const storage_by_event = eventIds
            .map(event_id => {
                const event = eventDetailsMap.get(event_id)
                const totals = eventStorageMap.get(event_id) || { original_kb: 0, compressed_kb: 0, stored_kb: 0, media_count: 0 }
                return { event_id, event_name: event?.event_name || 'Unknown', ...totals }
            })
            .sort((a, b) => b.stored_kb - a.stored_kb)

        const studioStorage = new Map()
        const clientStorage = new Map()
        const [mappedTenants, mappedUsers] = await Promise.all([
            prisma.tenant.findMany({
                where: { tenant_id: { in: [...new Set(tenantMappings.map(mapping => mapping.tenant_id).filter(Boolean))] } },
                select: { tenant_id: true, tenant_studio_name: true, tenant_name: true }
            }),
            prisma.user.findMany({
                where: { user_id: { in: [...new Set(userMappings.map(mapping => mapping.user_id).filter(Boolean))] } },
                select: { user_id: true, user_name: true, user_email_id: true }
            }),
        ])
        const tenantById = new Map(mappedTenants.map(tenant => [tenant.tenant_id, tenant]))
        const userById = new Map(mappedUsers.map(user => [user.user_id, user]))

        const tenantMappingsByEvent = new Map()
        for (const mapping of tenantMappings) {
            const list = tenantMappingsByEvent.get(mapping.event_id) || []
            list.push(mapping)
            tenantMappingsByEvent.set(mapping.event_id, list)
        }

        const userMappingsByEvent = new Map()
        for (const mapping of userMappings) {
            const list = userMappingsByEvent.get(mapping.event_id) || []
            list.push(mapping)
            userMappingsByEvent.set(mapping.event_id, list)
        }

        for (const event of scopedEvents) {
            const totals = eventStorageMap.get(event.event_id)
            if (!totals) continue

            for (const mapping of tenantMappingsByEvent.get(event.event_id) || []) {
                const tenant = tenantById.get(mapping.tenant_id)
                if (!tenant) continue
                const current = studioStorage.get(tenant.tenant_id) || {
                    tenant_id: tenant.tenant_id,
                    studio_name: tenant.tenant_studio_name || tenant.tenant_name || 'Studio',
                    stored_kb: 0,
                    original_kb: 0,
                    compressed_kb: 0,
                    event_count: 0,
                    media_count: 0,
                }
                current.stored_kb += totals.stored_kb
                current.original_kb += totals.original_kb
                current.compressed_kb += totals.compressed_kb
                current.event_count += 1
                current.media_count += totals.media_count
                studioStorage.set(tenant.tenant_id, current)
            }

            for (const mapping of userMappingsByEvent.get(event.event_id) || []) {
                const user = userById.get(mapping.user_id)
                if (!user) continue
                const current = clientStorage.get(user.user_id) || {
                    user_id: user.user_id,
                    user_name: user.user_name || user.user_email_id || 'Client',
                    user_email_id: user.user_email_id,
                    assigned_storage_kb: 0,
                    event_count: 0,
                    media_count: 0,
                }
                current.assigned_storage_kb += totals.stored_kb
                current.event_count += 1
                current.media_count += totals.media_count
                clientStorage.set(user.user_id, current)
            }
        }

        const storage_summary = {
            total_original_kb: storedMedia.reduce((sum, media) => sum + parseSizeToKb(media.original_size || media.media_size), 0),
            total_compressed_kb: storedMedia.reduce((sum, media) => {
                return sum + (media.compressed_server_path && media.compressed_server_path !== media.media_server_path ? parseSizeToKb(media.media_size) : 0)
            }, 0),
            total_stored_kb: storage_by_event.reduce((sum, event) => sum + event.stored_kb, 0),
            by_event: storage_by_event.slice(0, 10),
            by_studio: Array.from(studioStorage.values()).sort((a, b) => b.stored_kb - a.stored_kb).slice(0, 10),
            by_client: Array.from(clientStorage.values()).sort((a, b) => b.assigned_storage_kb - a.assigned_storage_kb).slice(0, 10),
        }

        // Event status breakdown (active vs archived — all time)
        const [activeCount, archivedCount] = await Promise.all([
            prisma.event.count({ where: { event_id: { in: eventIds }, isactive: true } }),
            prisma.event.count({ where: { event_id: { in: eventIds }, isactive: false } }),
        ])

        // Super admin: platform-wide studio + user growth
        let studio_growth = null
        let user_growth = null
        if (isSuperAdmin) {
            const [studiosRaw, usersRaw] = await Promise.all([
                prisma.tenant.findMany({
                    where: { createdAt: { gte: sixMonthsAgo } },
                    select: { createdAt: true }
                }),
                prisma.user.findMany({
                    where: { createdAt: { gte: sixMonthsAgo } },
                    select: { createdAt: true }
                }),
            ])

            const studioMap = Object.fromEntries(months.map(m => [m, 0]))
            for (const s of studiosRaw) studioMap[toKey(s.createdAt)] = (studioMap[toKey(s.createdAt)] || 0) + 1
            studio_growth = months.map(m => ({ month: m, count: studioMap[m] }))

            const userMap = Object.fromEntries(months.map(m => [m, 0]))
            for (const u of usersRaw) userMap[toKey(u.createdAt)] = (userMap[toKey(u.createdAt)] || 0) + 1
            user_growth = months.map(m => ({ month: m, count: userMap[m] }))
        }

        return successResponse(res, {
            totals: { events: eventIds.length, media: totalMediaCount, clients: allClients, favourites: allFavs },
            events_by_month,
            media_by_month,
            top_events,
            event_status: { active: activeCount, archived: archivedCount },
            studio_growth,
            user_growth,
            storage_summary,
        })
    } catch (err) {
        console.error("[DashboardAnalytics] Failed:", err)
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { createEvent, getAllEvents, getEventById, updateEvent, deleteEvent, hardDeleteEvent, getEventStats, getDashboardAnalytics }
