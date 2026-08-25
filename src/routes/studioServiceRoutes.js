const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { createService, getAllServices, updateService, deleteService, restoreService } = require("../controllers/studioServiceController")

router.post("/", verifyToken, requireRole("ADMIN"), createService)
router.get("/", verifyToken, requireRole("ADMIN"), getAllServices)
router.put("/:id", verifyToken, requireRole("ADMIN"), updateService)
router.put("/:id/restore", verifyToken, requireRole("ADMIN"), restoreService)
router.delete("/:id", verifyToken, requireRole("ADMIN"), deleteService)

module.exports = router
