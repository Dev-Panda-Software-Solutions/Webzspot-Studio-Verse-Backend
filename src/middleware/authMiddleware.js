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

        // An archived Tenant/User must lose access immediately, even with a still-valid
        // token — isactive on the parent entity, not just the Login row, gates access.
        if (loginRecord.tenant_id) {
            const tenant = await prisma.tenant.findUnique({ where: { tenant_id: loginRecord.tenant_id }, select: { isactive: true } })
            if (!tenant || !tenant.isactive) {
                return errorResponse(res, 'This studio account has been deactivated. Please contact the platform administrator.', 401)
            }
        } else if (loginRecord.user_id) {
            const user = await prisma.user.findUnique({ where: { user_id: loginRecord.user_id }, select: { isactive: true } })
            if (!user || !user.isactive) {
                return errorResponse(res, 'This account has been deactivated. Please contact your studio.', 401)
            }
        }

        req.user = decoded
        req.loginRecord = loginRecord
        next()
    } catch (err) {
        return errorResponse(res, 'Invalid or Expired Access Token', 401)
    }
}

module.exports = { verifyToken }
