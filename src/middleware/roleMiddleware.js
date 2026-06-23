const { errorResponse } = require("../utils/response")

const requireRole = (...roles) => (req, res, next) => {
    if (process.env.AUTH_ENABLED === "false") return next()
    if (!req.user || !roles.includes(req.user.role)) {
        return errorResponse(res, "Access denied. You do not have permission for this action.", 403)
    }
    next()
}

module.exports = { requireRole }
