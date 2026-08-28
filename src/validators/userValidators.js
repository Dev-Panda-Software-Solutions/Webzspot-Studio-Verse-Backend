const { body } = require("express-validator")

// Shared basic-identity checks — every client needs these, whether it's a
// bare billing-only contact or a full gallery-access client.
const clientFieldsValidator = [
    body("user_name").trim().notEmpty().withMessage("User name is required."),
    body("user_phone_number").optional({ nullable: true, checkFalsy: true }).trim(),
    body("user_email_id").optional({ nullable: true, checkFalsy: true }).trim().isEmail().withMessage("If provided, email must be valid."),
]

// A bare client (created for a quotation, or from the Access Board without
// picking a specific event yet) has no login until access is actually
// granted — validity_days/expiry_date/username/password are all optional
// here. If either username or password is supplied, both are required
// together (enforced in the controller, which also creates the Login).
const createUserValidator = [
    ...clientFieldsValidator,
    body("validity_days").optional({ nullable: true, checkFalsy: true }),
    body("expiry_date").optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage("Expiry date must be a valid date (YYYY-MM-DD)."),
    body("username").optional({ nullable: true, checkFalsy: true }).trim().isLength({ min: 4 }).withMessage("Username must be at least 4 characters."),
    body("password").optional({ nullable: true, checkFalsy: true }).isLength({ min: 6 }).withMessage("Password must be at least 6 characters."),
]

// Creating a client and immediately granting it event access always needs a
// real login and an access window, so these stay required here.
const createUserInEventValidator = [
    ...clientFieldsValidator,
    body("validity_days").notEmpty().withMessage("Validity days is required."),
    body("expiry_date").isISO8601().withMessage("Expiry date must be a valid date (YYYY-MM-DD)."),
    body("username").trim().isLength({ min: 4 }).withMessage("Username must be at least 4 characters."),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters."),
    body("event_id").trim().notEmpty().withMessage("event_id is required.")
]

module.exports = { createUserValidator, createUserInEventValidator }
