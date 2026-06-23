// DB-backed JWT blocklist — survives server restarts
// Entries are keyed by jti (JWT ID) and auto-expire via periodic cleanup
const prisma = require("./prismaClient")

const addToBlocklist = async (jti, expiresAt) => {
    try {
        await prisma.tokenBlocklist.upsert({
            where: { jti },
            update: { expiresAt: new Date(expiresAt) },
            create: { jti, expiresAt: new Date(expiresAt) },
        })
    } catch (err) {
        console.error("[Blocklist] Failed to persist token invalidation:", err.message)
    }
}

const isBlocked = async (jti) => {
    try {
        const entry = await prisma.tokenBlocklist.findUnique({ where: { jti } })
        if (!entry) return false
        // Auto-clean expired entries
        if (entry.expiresAt < new Date()) {
            await prisma.tokenBlocklist.delete({ where: { jti } }).catch(() => {})
            return false
        }
        return true
    } catch {
        // Fail-open on DB error so a DB outage doesn't lock everyone out
        return false
    }
}

// Purge all expired entries — call periodically (done in app.js keepalive)
const pruneExpired = async () => {
    try {
        const { count } = await prisma.tokenBlocklist.deleteMany({
            where: { expiresAt: { lt: new Date() } }
        })
        if (count > 0) console.log(`[Blocklist] Pruned ${count} expired entries`)
    } catch {}
}

module.exports = { addToBlocklist, isBlocked, pruneExpired }
