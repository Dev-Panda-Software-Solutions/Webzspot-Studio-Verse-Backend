const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const uploadGuestSelfie = require("../utils/uploadGuestSelfie")
const { publicUploadLimiter } = require("../middleware/rateLimiter")
const { registerGuest, getGuestsByEvent } = require("../controllers/eventGuestController")

// Public — no auth. Guest scans the event QR code and lands here.
router.post("/", publicUploadLimiter, uploadGuestSelfie.single("selfie"), registerGuest)

// Studio-facing guest list.
router.get("/event/:event_id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), getGuestsByEvent)

module.exports = router
