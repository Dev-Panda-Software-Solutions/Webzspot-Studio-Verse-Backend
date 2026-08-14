const { body } = require("express-validator")

const loginValidator = [
    body("username").trim().notEmpty().withMessage("Username is required."),
    body("password").notEmpty().withMessage("Password is required.")
]

const tenantSignupValidator = [
    // tenant_name / tenant_studio_address are optional at self-signup — the
    // studio owner can complete them later from Studio Settings.
    body("tenant_name").optional({ values: "falsy" }).trim(),
    body("tenant_phone_number").trim().notEmpty().withMessage("Phone number is required."),
    body("tenant_email_id").trim().isEmail().withMessage("Valid email is required."),
    body("tenant_studio_name").trim().notEmpty().withMessage("Studio name is required."),
    body("tenant_studio_address").optional({ values: "falsy" }).trim(),
    body("username").trim().isLength({ min: 4 }).withMessage("Username must be at least 4 characters."),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters.")
]

module.exports = { loginValidator, tenantSignupValidator }
