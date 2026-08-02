const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { validate } = require("../middleware/validate")
const { createTicketValidator, updateStatusValidator, addReplyValidator } = require("../validators/supportTicketValidators")
const {
    createTicket, getMyTickets, getAllTickets, getTicketById, updateTicketStatus, addReply
} = require("../controllers/supportTicketController")

// Any authenticated role can raise/view/reply to their own tickets.
router.post("/", verifyToken, createTicketValidator, validate, createTicket)
router.get("/my-tickets", verifyToken, getMyTickets)
router.get("/", verifyToken, requireRole("SUPER_ADMIN"), getAllTickets)
router.get("/:id", verifyToken, getTicketById)
router.put("/:id/status", verifyToken, requireRole("SUPER_ADMIN"), updateStatusValidator, validate, updateTicketStatus)
router.post("/:id/reply", verifyToken, addReplyValidator, validate, addReply)

module.exports = router
