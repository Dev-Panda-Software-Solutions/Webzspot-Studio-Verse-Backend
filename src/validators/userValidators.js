const { body } = require("express-validator")

const createUserValidator = [
    body("user_name").trim().notEmpty().withMessage("User name is required."),
    body("user_phone_number").optional({ nullable: true, checkFalsy: true }).trim(),
    body("user_email_id").optional({ nullable: true, checkFalsy: true }).trim().isEmail().withMessage("If provided, email must be valid."),
    body("validity_days").notEmpty().withMessage("Validity days is required."),
    body("expiry_date").isISO8601().withMessage("Expiry date must be a valid date (YYYY-MM-DD)."),
    body("username").trim().isLength({ min: 4 }).withMessage("Username must be at least 4 characters."),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters.")
]

const createUserInEventValidator = [
    ...createUserValidator,
    body("event_id").trim().notEmpty().withMessage("event_id is required.")
]

module.exports = { createUserValidator, createUserInEventValidator }
