const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { createBillingClient, getAllBillingClients, updateBillingClient } = require("../controllers/billingClientController")

router.post("/", verifyToken, requireRole("ADMIN"), createBillingClient)
router.get("/", verifyToken, requireRole("ADMIN"), getAllBillingClients)
router.put("/:id", verifyToken, requireRole("ADMIN"), updateBillingClient)

module.exports = router
