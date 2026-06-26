const crypto = require("crypto")
const logger = require("../utils/logger")

const hasData = (value) => value && typeof value === "object" && Object.keys(value).length > 0

const requestLogger = (req, res, next) => {
    const start = process.hrtime.bigint()
    const requestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    req.requestId = requestId

    const method = logger.color(logger.methodColor(req.method), req.method)
    const url = logger.color("white", req.originalUrl || req.url)
    const ip = req.ip || req.socket?.remoteAddress || "unknown-ip"

    logger.info("HTTP", `${logger.color("cyan", "REQ")} ${method} ${url}`, {
        request_id: requestId,
        ip,
        origin: req.headers.origin,
        user_agent: req.headers["user-agent"]
    })

    res.on("finish", () => {
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6
        const status = res.statusCode
        const statusText = logger.color(logger.statusColor(status), status)
        const user = req.user ? `${req.user.role || "UNKNOWN"}:${req.user.id || "unknown"}` : "anonymous"
        const scope = status >= 500 ? "HTTP-ERROR" : status >= 400 ? "HTTP-WARN" : "HTTP"
        const logFn = status >= 500 ? logger.error : status >= 400 ? logger.warn : logger.success

        const meta = {
            request_id: requestId,
            status,
            duration_ms: Number(elapsedMs.toFixed(1)),
            ip,
            user,
            route: req.route?.path,
            query: hasData(req.query) ? req.query : undefined,
            params: hasData(req.params) ? req.params : undefined,
            body: hasData(req.body) && !Buffer.isBuffer(req.body) ? req.body : undefined
        }

        logFn(scope, `${logger.color("magenta", "RES")} ${method} ${url} ${statusText} ${logger.color("gray", `${elapsedMs.toFixed(1)}ms`)}`, meta)
    })

    next()
}

module.exports = requestLogger
