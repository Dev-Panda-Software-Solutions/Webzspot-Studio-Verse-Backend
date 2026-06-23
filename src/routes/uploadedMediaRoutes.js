const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const upload = require("../utils/upload")
const { uploadMedia, getAllMediaByEvent, getMediaById, deleteMedia, hardDeleteMedia } = require("../controllers/uploadedMediaController")

// Only tenants and super admin can upload and delete media
router.post("/upload", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), upload.single("file"), uploadMedia)
router.get("/event/:event_id", verifyToken, getAllMediaByEvent)
router.get("/:id", verifyToken, getMediaById)
router.delete("/hard/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), hardDeleteMedia)
router.delete("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), deleteMedia)

module.exports = router
