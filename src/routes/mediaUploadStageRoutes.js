const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { createMediaUploadStage, getAllMediaUploadStagesByEvent, getMediaUploadStageById, updateMediaUploadStage, deleteMediaUploadStage, hardDeleteMediaUploadStage } = require("../controllers/mediaUploadStageController")

router.post("/", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), createMediaUploadStage)
router.get("/event/:event_id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), getAllMediaUploadStagesByEvent)
router.get("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), getMediaUploadStageById)
router.put("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), updateMediaUploadStage)
router.delete("/hard/:id", verifyToken, requireRole("SUPER_ADMIN"), hardDeleteMediaUploadStage)
router.delete("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), deleteMediaUploadStage)

module.exports = router
