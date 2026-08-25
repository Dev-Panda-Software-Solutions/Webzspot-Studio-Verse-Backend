const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { createPayment, getPaymentsForBill, getPaymentById, downloadReceiptPdf } = require("../controllers/paymentController")

router.post("/", verifyToken, requireRole("ADMIN"), createPayment)
router.get("/bill/:billId", verifyToken, requireRole("ADMIN"), getPaymentsForBill)
router.get("/:id/pdf", verifyToken, requireRole("ADMIN"), downloadReceiptPdf)
router.get("/:id", verifyToken, requireRole("ADMIN"), getPaymentById)

module.exports = router
