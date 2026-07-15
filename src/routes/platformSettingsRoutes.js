const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { getSettings, updateSettings } = require("../controllers/platformSettingsController")

router.get("/", verifyToken, requireRole("SUPER_ADMIN"), getSettings)
router.put("/", verifyToken, requireRole("SUPER_ADMIN"), updateSettings)

module.exports = router
