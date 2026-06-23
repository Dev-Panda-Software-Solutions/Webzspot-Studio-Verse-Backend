const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { createTenantSettings, getTenantSettings, updateTenantSettings, deleteTenantSettings, hardDeleteTenantSettings } = require("../controllers/tenantSettingsController")

router.post("/", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), createTenantSettings)
router.get("/:tenant_id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), getTenantSettings)
router.put("/:tenant_id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), updateTenantSettings)
router.delete("/hard/:tenant_id", verifyToken, requireRole("SUPER_ADMIN"), hardDeleteTenantSettings)
router.delete("/:tenant_id", verifyToken, requireRole("SUPER_ADMIN"), deleteTenantSettings)

module.exports = router
