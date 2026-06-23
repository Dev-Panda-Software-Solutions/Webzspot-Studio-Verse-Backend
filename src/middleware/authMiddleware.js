const jwt = require("jsonwebtoken")
const prisma = require("../utils/prismaClient")
const { errorResponse } = require("../utils/response")
const { isBlocked } = require("../utils/tokenBlocklist")

const verifyToken = async (req, res, next) => {
    if (process.env.AUTH_ENABLED === 'false') {
        // Hard-block in production regardless of env flag
        if (process.env.NODE_ENV === 'production') {
            console.error("FATAL: AUTH_ENABLED=false is not permitted in production. Refusing request.")
            return errorResponse(res, 'Server misconfiguration. Contact administrator.', 500)
        }
        req.user = { id: "dev", role: "SUPER_ADMIN" }
        return next()
    }

    const token = req.headers["authorization"]?.split(' ')[1]
    if (!token) return errorResponse(res, 'No Access Token Provided', 401)

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        // Reject tokens that have been explicitly logged out (DB-backed, survives restarts)
        if (decoded.jti && await isBlocked(decoded.jti)) {
            return errorResponse(res, 'Token has been invalidated. Please log in again.', 401)
        }

        // Verify that the login record still exists in the database
        const loginRecord = await prisma.login.findUnique({ where: { transid: decoded.id } })
        if (!loginRecord || !loginRecord.isactive) {
            return errorResponse(res, 'Session is invalid or expired. Please log in again.', 401)
        }

        req.user = decoded
        req.loginRecord = loginRecord
        next()
    } catch (err) {
        return errorResponse(res, 'Invalid or Expired Access Token', 401)
    }
}

module.exports = { verifyToken }
