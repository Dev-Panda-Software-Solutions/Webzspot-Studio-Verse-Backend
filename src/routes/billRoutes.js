const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { createBillFromQuotation, getAllBills, getBillById, downloadBillPdf } = require("../controllers/billController")

router.post("/", verifyToken, requireRole("ADMIN"), createBillFromQuotation)
router.get("/", verifyToken, requireRole("ADMIN"), getAllBills)
router.get("/:id/pdf", verifyToken, requireRole("ADMIN"), downloadBillPdf)
router.get("/:id", verifyToken, requireRole("ADMIN"), getBillById)

module.exports = router
