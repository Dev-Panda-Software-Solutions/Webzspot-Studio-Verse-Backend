const colors = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    gray: "\x1b[90m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m"
}

const redactKeys = [
    "authorization",
    "cookie",
    "password",
    "password_hash",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "jwt",
    "otp",
    "aws_access_key_id",
    "aws_secret_access_key"
]

const color = (name, value) => `${colors[name] || ""}${value}${colors.reset}`

const now = () => new Date().toISOString()

const isSensitiveKey = (key = "") => {
    const lower = String(key).toLowerCase()
    return redactKeys.some(sensitive => lower.includes(sensitive))
}

const sanitize = (value, depth = 0) => {
    if (value == null) return value
    if (depth > 4) return "[MaxDepth]"
    if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`
    if (Array.isArray(value)) return value.slice(0, 25).map(item => sanitize(item, depth + 1))
    if (typeof value === "object") {
        return Object.entries(value).reduce((acc, [key, item]) => {
            acc[key] = isSensitiveKey(key) ? "[REDACTED]" : sanitize(item, depth + 1)
            return acc
        }, {})
    }
    if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}...` : value
    return value
}

const stringify = (value) => {
    if (value == null) return ""
    if (typeof value === "string") return value
    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

const levelColor = (level) => {
    switch (level) {
        case "error": return "red"
        case "warn": return "yellow"
        case "success": return "green"
        case "debug": return "gray"
        default: return "cyan"
    }
}

const log = (level, scope, message, meta) => {
    const tag = color(levelColor(level), `[${level.toUpperCase()}]`)
    const scopeText = scope ? color("magenta", `[${scope}]`) : ""
    const line = `${color("gray", now())} ${tag}${scopeText} ${message}`
    const writer = level === "error" ? console.error : level === "warn" ? console.warn : console.log
    writer(line)
    if (meta !== undefined) writer(`${colors.dim}${stringify(sanitize(meta))}${colors.reset}`)
}

const info = (scope, message, meta) => log("info", scope, message, meta)
const success = (scope, message, meta) => log("success", scope, message, meta)
const warn = (scope, message, meta) => log("warn", scope, message, meta)
const error = (scope, message, errOrMeta) => {
    if (errOrMeta instanceof Error) {
        log("error", scope, message, {
            name: errOrMeta.name,
            message: errOrMeta.message,
            code: errOrMeta.code,
            meta: errOrMeta.meta,
            stack: errOrMeta.stack
        })
        return
    }
    log("error", scope, message, errOrMeta)
}
const debug = (scope, message, meta) => {
    if (process.env.LOG_LEVEL === "debug") log("debug", scope, message, meta)
}

const statusColor = (statusCode) => {
    if (statusCode >= 500) return "red"
    if (statusCode >= 400) return "yellow"
    if (statusCode >= 300) return "cyan"
    return "green"
}

const methodColor = (method) => {
    switch (method) {
        case "GET": return "blue"
        case "POST": return "green"
        case "PUT":
        case "PATCH": return "yellow"
        case "DELETE": return "red"
        default: return "white"
    }
}

module.exports = {
    colors,
    color,
    sanitize,
    stringify,
    statusColor,
    methodColor,
    info,
    success,
    warn,
    error,
    debug
}
