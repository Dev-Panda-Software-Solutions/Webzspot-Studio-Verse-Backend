const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { login, logout, tenantSignup, getMe, changePassword } = require("../controllers/authController")
const { loginValidator, tenantSignupValidator } = require("../validators/authValidators")
const { validate } = require("../middleware/validate")

router.post("/login", loginValidator, validate, login)
router.post("/logout", verifyToken, logout)
router.post("/signup", tenantSignupValidator, validate, tenantSignup)
router.get("/me", verifyToken, getMe)
router.put("/change-password", verifyToken, changePassword)

module.exports = router
