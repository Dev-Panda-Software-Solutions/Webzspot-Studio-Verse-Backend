const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const upload = require("../utils/upload")
const {
    uploadMedia,
    initiateLargeUpload,
    uploadLargePart,
    completeLargeUpload,
    abortLargeUpload,
    getAllMediaByEvent,
    getMediaById,
    deleteMedia,
    restoreMedia,
    hardDeleteMedia
} = require("../controllers/uploadedMediaController")

// Only tenants and super admin can upload and delete media
router.post("/upload", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), upload.single("file"), uploadMedia)
router.post("/large/initiate", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), initiateLargeUpload)
router.put(
    "/large/part",
    verifyToken,
    requireRole("SUPER_ADMIN", "ADMIN"),
    express.raw({ type: "application/octet-stream", limit: "16mb" }),
    uploadLargePart
)
router.post("/large/complete", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), completeLargeUpload)
router.post("/large/abort", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), abortLargeUpload)
router.get("/event/:event_id", verifyToken, getAllMediaByEvent)
router.get("/:id", verifyToken, getMediaById)
router.put("/:id/restore", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), restoreMedia)
router.delete("/hard/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), hardDeleteMedia)
router.delete("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), deleteMedia)

module.exports = router
