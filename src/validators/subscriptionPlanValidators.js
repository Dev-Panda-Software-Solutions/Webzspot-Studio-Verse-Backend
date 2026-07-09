const { body } = require("express-validator")

const createPlanValidator = [
    body("plan_name").trim().notEmpty().withMessage("Plan name is required."),
    body("plan_type").isIn(["SUBSCRIPTION", "WALLET"]).withMessage("plan_type must be SUBSCRIPTION or WALLET."),
    body("price").isFloat({ min: 0 }).withMessage("Price must be a non-negative number."),
    body("duration_value").if(body("plan_type").equals("SUBSCRIPTION")).isInt({ min: 1 }).withMessage("duration_value is required for subscription plans."),
    body("duration_unit").if(body("plan_type").equals("SUBSCRIPTION")).isIn(["DAYS", "MONTHS", "YEARS"]).withMessage("duration_unit must be DAYS, MONTHS or YEARS."),
    body("photo_quota").if(body("plan_type").equals("SUBSCRIPTION")).isInt({ min: 1 }).withMessage("photo_quota is required for subscription plans."),
    body("wallet_credits").if(body("plan_type").equals("WALLET")).isInt({ min: 1 }).withMessage("wallet_credits is required for wallet plans."),
    body("price_lock_window_days").optional().isInt({ min: 0 }).withMessage("price_lock_window_days must be a non-negative integer.")
]

const updatePlanValidator = [
    body("plan_name").optional().trim().notEmpty().withMessage("Plan name cannot be empty."),
    body("plan_type").optional().isIn(["SUBSCRIPTION", "WALLET"]).withMessage("plan_type must be SUBSCRIPTION or WALLET."),
    body("price").optional().isFloat({ min: 0 }).withMessage("Price must be a non-negative number."),
    body("price_lock_window_days").optional().isInt({ min: 0 }).withMessage("price_lock_window_days must be a non-negative integer.")
]

module.exports = { createPlanValidator, updatePlanValidator }
