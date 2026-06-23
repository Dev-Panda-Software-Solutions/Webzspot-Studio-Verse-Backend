const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { assignTenantToEvent, updateCollaborationRole, getTenantsByEvent, removeTenantFromEvent, hardDeleteTenantFromEvent } = require("../controllers/eventTenantMappingController")

router.post("/", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), assignTenantToEvent)
router.get("/:event_id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), getTenantsByEvent)
router.put("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), updateCollaborationRole)
router.delete("/hard/:id", verifyToken, requireRole("SUPER_ADMIN"), hardDeleteTenantFromEvent)
router.delete("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), removeTenantFromEvent)

module.exports = router
