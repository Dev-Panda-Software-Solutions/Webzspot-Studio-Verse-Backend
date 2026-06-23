const { body } = require("express-validator")

const createTenantValidator = [
    body("tenant_name").trim().notEmpty().withMessage("Tenant name is required."),
    body("tenant_phone_number").trim().notEmpty().withMessage("Phone number is required."),
    body("tenant_email_id").trim().isEmail().withMessage("Valid email is required."),
    body("tenant_studio_name").trim().notEmpty().withMessage("Studio name is required."),
    body("tenant_studio_address").trim().notEmpty().withMessage("Studio address is required."),
    body("username").trim().isLength({ min: 4 }).withMessage("Username must be at least 4 characters."),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters.")
]

module.exports = { createTenantValidator }
