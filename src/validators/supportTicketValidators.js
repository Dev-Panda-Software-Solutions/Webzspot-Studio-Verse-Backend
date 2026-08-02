const { body } = require("express-validator")

const createTicketValidator = [
    body("subject").trim().notEmpty().withMessage("Subject is required.").isLength({ max: 200 }).withMessage("Subject must be under 200 characters."),
    body("description").trim().notEmpty().withMessage("Description is required.")
]

const updateStatusValidator = [
    body("status").isIn(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).withMessage("Invalid status.")
]

const addReplyValidator = [
    body("message").trim().notEmpty().withMessage("Message is required.")
]

module.exports = { createTicketValidator, updateStatusValidator, addReplyValidator }
