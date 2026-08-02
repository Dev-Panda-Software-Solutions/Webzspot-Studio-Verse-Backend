const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const {
    getMySubscription, getTenantSubscription, getMySubscriptionHistory, getTenantSubscriptionHistory, subscribeToPlan, upgradePlan, rechargeWallet, activateTrial
} = require("../controllers/tenantSubscriptionController")

router.get("/my-subscription", verifyToken, requireRole("ADMIN"), getMySubscription)
router.get("/my-subscription/history", verifyToken, requireRole("ADMIN"), getMySubscriptionHistory)
router.get("/tenant/:tenant_id", verifyToken, requireRole("SUPER_ADMIN"), getTenantSubscription)
router.get("/tenant/:tenant_id/history", verifyToken, requireRole("SUPER_ADMIN"), getTenantSubscriptionHistory)
router.post("/subscribe", verifyToken, requireRole("ADMIN"), subscribeToPlan)
router.post("/upgrade", verifyToken, requireRole("ADMIN"), upgradePlan)
router.post("/recharge", verifyToken, requireRole("ADMIN"), rechargeWallet)
router.post("/activate-trial", verifyToken, requireRole("ADMIN"), activateTrial)

module.exports = router
