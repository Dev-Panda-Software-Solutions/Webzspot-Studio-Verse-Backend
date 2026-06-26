const express = require("express")
const path = require("path")
const cors = require("cors")
const dotenv = require("dotenv")
const helmet = require("helmet")

dotenv.config({ debug: true })

// Validate required env vars at startup — fail fast if missing
const requiredEnvs = ["JWT_SECRET", "DATABASE_URL", "JWT_EXPIRES_IN"]
requiredEnvs.forEach(key => {
    if (!process.env[key]) {
        console.error(`FATAL: Missing required environment variable: ${key}`)
        process.exit(1)
    }
})

if (process.env.AUTH_ENABLED === "false") {
    console.warn("WARNING: AUTH_ENABLED is false — all authentication is disabled. Do NOT use in production.")
}

const authRoutes = require("./routes/authRoutes")
const superAdminRoutes = require("./routes/superAminRoutes")
const tenantRoutes = require("./routes/tenantRoutes")
const userRoutes = require("./routes/userRoutes")
const eventRoutes = require("./routes/eventRoutes")
const eventTenantMappingRoutes = require("./routes/eventTenantMappingRoutes")
const eventUserMappingRoutes = require("./routes/eventUserMappingRoutes")
const mediaUploadStageRoutes = require("./routes/mediaUploadStageRoutes")
const uploadedMediaRoutes = require("./routes/uploadedMediaRoutes")
const mediaServeRoutes = require("./routes/mediaServeRoutes")
const favouriteRoutes = require("./routes/favouriteRoutes")
const tenantFavouriteRoutes = require("./routes/tenantFavouriteRoutes")
const tenantSettingsRoutes = require("./routes/tenantSettingsRoutes")
const uploadRoutes = require("./routes/uploadRoutes")
const { loginLimiter, uploadLimiter, publicUploadLimiter } = require("./middleware/rateLimiter")
const { pruneExpired } = require("./utils/tokenBlocklist")

const app = express()

const trustProxyValue = (() => {
    const raw = process.env.TRUST_PROXY
    if (!raw) return 1
    if (raw === "false") return false
    if (raw === "true") return 1
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : raw
})()
app.set("trust proxy", trustProxyValue)

// Request logger — prints method, path, status, and duration for every request
app.use((req, res, next) => {
    const start = Date.now()
    res.on('finish', () => {
        const ms = Date.now() - start
        const color = res.statusCode >= 500 ? '\x1b[31m'
            : res.statusCode >= 400 ? '\x1b[33m'
            : res.statusCode >= 300 ? '\x1b[36m'
            : '\x1b[32m'
        console.log(`${color}${req.method}\x1b[0m ${req.path} → ${res.statusCode} (${ms}ms)`)
    })
    next()
})

app.use(helmet({
    crossOriginResourcePolicy: { policy: "same-origin" },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", "blob:", "data:"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
        }
    }
}))

app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}))

app.use(express.json({ limit: "10kb" }))

// Rate limiting — applied before route handlers
app.use("/api/auth/login", loginLimiter)
app.use("/api/uploaded-media/upload", uploadLimiter)
app.use("/api/upload/public-profile", publicUploadLimiter)
app.use("/api/upload", uploadLimiter)

app.use("/api/auth", authRoutes)
app.use("/api/super-admins", superAdminRoutes)
app.use("/api/tenants", tenantRoutes)
app.use("/api/users", userRoutes)
app.use("/api/events", eventRoutes)
app.use("/api/event-tenant-mapping", eventTenantMappingRoutes)
app.use("/api/event-user-mapping", eventUserMappingRoutes)
app.use("/api/media-upload-stages", mediaUploadStageRoutes)
app.use("/api/uploaded-media", uploadedMediaRoutes)
app.use("/api/media", mediaServeRoutes)
app.use("/api/favourites", favouriteRoutes)
app.use("/api/tenant-favourites", tenantFavouriteRoutes)
app.use("/api/tenant-settings", tenantSettingsRoutes)
app.use("/api/upload", uploadRoutes)
// Branding/cover/profile assets — safe to serve publicly (not sensitive client media).
// All event media files require authentication via /api/media token flow.
const staticOpts = {
    maxAge: "1d",
    setHeaders: (res) => { res.setHeader("Cross-Origin-Resource-Policy", "cross-origin") }
}
app.use("/uploads/watermarks", express.static(path.join(__dirname, "../uploads/watermarks"), staticOpts))
app.use("/uploads/covers",     express.static(path.join(__dirname, "../uploads/covers"),     staticOpts))
app.use("/uploads/profiles",   express.static(path.join(__dirname, "../uploads/profiles"),   staticOpts))

app.get("/", (req, res) => {
    res.json({ message: "Webzspot Studio API is Alive." })
})

// Global error handler — catches multer rejections, unhandled throws, and anything else
app.use((err, req, res, next) => {
    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ success: false, message: "File too large. Maximum allowed is 500MB for media and 5MB for profile images.", data: null })
    }
    if (err.message && (err.message.includes("File type not allowed") || err.message.includes("Only image files"))) {
        return res.status(415).json({ success: false, message: err.message, data: null })
    }
    console.error("Unhandled error:", err)
    return res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again.", data: null })
})

const PORT = process.env.PORT || 5000
const prisma = require("./utils/prismaClient")

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}...`)
    try {
        const t = Date.now()
        await prisma.$connect()
        console.log(`\x1b[32m[DB] Connection pool ready (${Date.now() - t}ms)\x1b[0m`)
    } catch (err) {
        console.error('\x1b[31m[DB] Connection failed at startup:\x1b[0m', err.message)
    }

    // Keepalive ping every 45s — prevents NAT/firewall from dropping idle DB connections
    setInterval(async () => {
        try { await prisma.$queryRaw`SELECT 1` } catch {}
    }, 45_000)

    // Prune expired JWT blocklist entries every 30 minutes
    setInterval(pruneExpired, 30 * 60 * 1000)
})

module.exports = app
