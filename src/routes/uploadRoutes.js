const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const uploadProfile = require("../utils/uploadProfile")
const uploadCover = require("../utils/uploadCover")
const uploadWatermark = require("../utils/uploadWatermark")
const uploadPublic = require("../utils/uploadPublic")
const { uploadProfileImage, uploadCoverImage, uploadWatermark: uploadWatermarkHandler, uploadPublicProfile } = require("../controllers/uploadController")

// Profile image — folder auto-selected by role: tenants / users / super-admins
router.post("/profile", verifyToken, uploadProfile.single("image"), uploadProfileImage)

// Event cover image — saves to uploads/covers/
router.post("/cover", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), uploadCover.single("image"), uploadCoverImage)

// Tenant watermark — saves to uploads/watermarks/ and updates TenantSettings
router.post("/watermark", verifyToken, requireRole("ADMIN"), uploadWatermark.single("image"), uploadWatermarkHandler)

// Public pre-signup profile upload — no auth, 2MB limit, 10 uploads/hour per IP
router.post("/public-profile", uploadPublic.single("image"), uploadPublicProfile)

module.exports = router
