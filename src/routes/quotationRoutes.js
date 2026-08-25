const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { createQuotation, getAllQuotations, getQuotationById, updateQuotation, deleteQuotation } = require("../controllers/quotationController")

router.post("/", verifyToken, requireRole("ADMIN"), createQuotation)
router.get("/", verifyToken, requireRole("ADMIN"), getAllQuotations)
router.get("/:id", verifyToken, requireRole("ADMIN"), getQuotationById)
router.put("/:id", verifyToken, requireRole("ADMIN"), updateQuotation)
router.delete("/:id", verifyToken, requireRole("ADMIN"), deleteQuotation)

module.exports = router
