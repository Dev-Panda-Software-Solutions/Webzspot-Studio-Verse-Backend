const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { createTenantValidator } = require("../validators/tenantValidators")
const { validate } = require("../middleware/validate")
const { getAllTenants, getTenantById, getTenantSummary, grantFreeAccess, revokeFreeAccess, setTenantPlan, createTenant, updateTenant, deleteTenant, hardDeleteTenant, restoreTenant, deleteTenantStorage } = require("../controllers/tenantController")

// Only super admin can manage tenants directly
router.post("/", verifyToken, requireRole("SUPER_ADMIN"), createTenantValidator, validate, createTenant)
router.get("/", verifyToken, requireRole("SUPER_ADMIN"), getAllTenants)
router.get("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), getTenantById)
router.get("/:id/summary", verifyToken, requireRole("SUPER_ADMIN"), getTenantSummary)
router.put("/:id/free-access", verifyToken, requireRole("SUPER_ADMIN"), grantFreeAccess)
router.delete("/:id/free-access", verifyToken, requireRole("SUPER_ADMIN"), revokeFreeAccess)
router.put("/:id/plan", verifyToken, requireRole("SUPER_ADMIN"), setTenantPlan)
router.put("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), updateTenant)
router.put("/:id/restore", verifyToken, requireRole("SUPER_ADMIN"), restoreTenant)
router.delete("/hard/:id", verifyToken, requireRole("SUPER_ADMIN"), hardDeleteTenant)
router.delete("/:id/storage", verifyToken, requireRole("SUPER_ADMIN"), deleteTenantStorage)
router.delete("/:id", verifyToken, requireRole("SUPER_ADMIN"), deleteTenant)

module.exports = router
