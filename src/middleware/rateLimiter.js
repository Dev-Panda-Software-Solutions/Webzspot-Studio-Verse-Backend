const rateLimit = require("express-rate-limit")

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // max 15 login attempts per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many login attempts from this IP. Please try again in 15 minutes.", data: null }
})

const uploadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many upload requests. Please slow down.", data: null }
})

const publicUploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many profile uploads from this IP. Please try again later.", data: null }
})

module.exports = { loginLimiter, uploadLimiter, publicUploadLimiter }
