const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { createEventValidator } = require("../validators/eventValidators")
const { validate } = require("../middleware/validate")
const { createEvent, getAllEvents, getEventById, updateEvent, deleteEvent, hardDeleteEvent, getEventStats, getDashboardAnalytics } = require("../controllers/eventController")

// Tenants create and manage events; users can only view
router.get("/stats", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), getEventStats)
router.get("/analytics", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), getDashboardAnalytics)
router.post("/", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), createEventValidator, validate, createEvent)
router.get("/", verifyToken, getAllEvents)
router.get("/:id", verifyToken, getEventById)
router.put("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), updateEvent)
router.delete("/hard/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), hardDeleteEvent)
router.delete("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), deleteEvent)

module.exports = router
