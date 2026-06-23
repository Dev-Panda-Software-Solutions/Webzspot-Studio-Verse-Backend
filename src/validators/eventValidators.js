const { body } = require("express-validator")

const createEventValidator = [
    body("event_name").trim().notEmpty().withMessage("Event name is required."),
    body("event_date").optional().isISO8601().withMessage("event_date must be a valid date (YYYY-MM-DD)."),
    body("event_organizer_email_id").optional().isEmail().withMessage("Organizer email must be a valid email.")
]

module.exports = { createEventValidator }
