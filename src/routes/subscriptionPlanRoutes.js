const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { createPlanValidator, updatePlanValidator } = require("../validators/subscriptionPlanValidators")
const { validate } = require("../middleware/validate")
const {
    createPlan, getAllPlans, getPlanById, updatePlan, reorderPlans, deletePlan, hardDeletePlan
} = require("../controllers/subscriptionPlanController")

// SUPER_ADMIN manages plans; ADMIN can browse the catalog to subscribe
router.post("/", verifyToken, requireRole("SUPER_ADMIN"), createPlanValidator, validate, createPlan)
router.get("/", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), getAllPlans)
router.get("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), getPlanById)
router.put("/:id", verifyToken, requireRole("SUPER_ADMIN"), updatePlanValidator, validate, updatePlan)
router.post("/reorder", verifyToken, requireRole("SUPER_ADMIN"), reorderPlans)
router.delete("/hard/:id", verifyToken, requireRole("SUPER_ADMIN"), hardDeletePlan)
router.delete("/:id", verifyToken, requireRole("SUPER_ADMIN"), deletePlan)

module.exports = router
