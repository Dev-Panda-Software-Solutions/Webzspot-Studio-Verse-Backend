const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { assignUserToEvent, updateEventUserMapping, getUsersByEvent, getEventsByUser, removeUserFromEvent, hardDeleteUserFromEvent } = require("../controllers/eventUserMappingController")

router.post("/", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), assignUserToEvent)
router.patch("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), updateEventUserMapping)
router.get("/event/:event_id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), getUsersByEvent)
router.get("/user/:user_id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), getEventsByUser)
router.delete("/hard/:id", verifyToken, requireRole("SUPER_ADMIN"), hardDeleteUserFromEvent)
router.delete("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), removeUserFromEvent)

module.exports = router
