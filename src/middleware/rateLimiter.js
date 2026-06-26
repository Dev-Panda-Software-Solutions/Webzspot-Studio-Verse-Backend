const rateLimit = require("express-rate-limit")

const envInt = (key, fallback) => {
    const value = Number.parseInt(process.env[key], 10)
    return Number.isFinite(value) && value > 0 ? value : fallback
}

const minuteMs = 60 * 1000
const loginWindowMinutes = envInt("LOGIN_RATE_LIMIT_WINDOW_MINUTES", 15)
const uploadWindowMinutes = envInt("UPLOAD_RATE_LIMIT_WINDOW_MINUTES", 1)
const publicUploadWindowMinutes = envInt("PUBLIC_UPLOAD_RATE_LIMIT_WINDOW_MINUTES", 60)

const loginLimiter = rateLimit({
    windowMs: loginWindowMinutes * minuteMs,
    max: envInt("LOGIN_RATE_LIMIT_MAX", 15),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: `Too many login attempts from this IP. Please try again in ${loginWindowMinutes} minute${loginWindowMinutes === 1 ? "" : "s"}.`,
        data: null
    }
})

const uploadLimiter = rateLimit({
    windowMs: uploadWindowMinutes * minuteMs,
    max: envInt("UPLOAD_RATE_LIMIT_MAX", 30),
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many upload requests. Please slow down.", data: null }
})

const publicUploadLimiter = rateLimit({
    windowMs: publicUploadWindowMinutes * minuteMs,
    max: envInt("PUBLIC_UPLOAD_RATE_LIMIT_MAX", 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many profile uploads from this IP. Please try again later.", data: null }
})

module.exports = { loginLimiter, uploadLimiter, publicUploadLimiter }
