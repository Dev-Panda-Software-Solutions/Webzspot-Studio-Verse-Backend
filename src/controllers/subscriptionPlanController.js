const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")

const createPlan = async (req, res) => {
    try {
        const {
            plan_name, plan_type, duration_value, duration_unit, photo_quota,
            price, wallet_credits, ai_credit_cost_per_photo, price_lock_window_days,
            launched_at
        } = req.body

        const maxOrder = await prisma.subscriptionPlan.aggregate({ _max: { display_order: true } })
        const display_order = (maxOrder._max.display_order ?? -1) + 1

        const plan = await prisma.subscriptionPlan.create({
            data: {
                plan_name,
                plan_type,
                duration_value: plan_type === "SUBSCRIPTION" ? duration_value : null,
                duration_unit: plan_type === "SUBSCRIPTION" ? duration_unit : null,
                photo_quota: plan_type === "SUBSCRIPTION" ? photo_quota : null,
                price,
                wallet_credits: plan_type === "WALLET" ? wallet_credits : null,
                ai_credit_cost_per_photo: plan_type === "WALLET" ? ai_credit_cost_per_photo : null,
                price_lock_window_days: price_lock_window_days || 0,
                launched_at: launched_at ? new Date(launched_at) : new Date(),
                display_order,
                createdBy: req.user?.id || "SYSTEM"
            }
        })
        return successResponse(res, plan, "Plan Created Successfully.", 201)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getAllPlans = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
        const skip = (page - 1) * limit
        const where = { isactive: true }
        const [items, total] = await Promise.all([
            prisma.subscriptionPlan.findMany({ where, skip, take: limit, orderBy: { display_order: "asc" } }),
            prisma.subscriptionPlan.count({ where })
        ])
        return successResponse(res, { items, total, page, limit, pages: Math.ceil(total / limit) })
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const getPlanById = async (req, res) => {
    try {
        const plan = await prisma.subscriptionPlan.findUnique({ where: { subscription_plan_id: req.params.id } })
        if (!plan) return errorResponse(res, "Plan Not Found.", 404)
        return successResponse(res, plan)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const updatePlan = async (req, res) => {
    try {
        const existing = await prisma.subscriptionPlan.findUnique({ where: { subscription_plan_id: req.params.id } })
        if (!existing) return errorResponse(res, "Plan Not Found.", 404)

        const {
            plan_name, plan_type, duration_value, duration_unit, photo_quota,
            price, wallet_credits, ai_credit_cost_per_photo, price_lock_window_days,
            launched_at
        } = req.body
        const effectiveType = plan_type || existing.plan_type

        const plan = await prisma.subscriptionPlan.update({
            where: { subscription_plan_id: req.params.id },
            data: {
                plan_name, plan_type,
                duration_value: effectiveType === "SUBSCRIPTION" ? duration_value : null,
                duration_unit: effectiveType === "SUBSCRIPTION" ? duration_unit : null,
                photo_quota: effectiveType === "SUBSCRIPTION" ? photo_quota : null,
                price,
                wallet_credits: effectiveType === "WALLET" ? wallet_credits : null,
                ai_credit_cost_per_photo: effectiveType === "WALLET" ? ai_credit_cost_per_photo : null,
                price_lock_window_days,
                launched_at: launched_at ? new Date(launched_at) : undefined,
                updatedBy: req.user?.id
            }
        })
        return successResponse(res, plan, "Plan Updated Successfully.")
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const reorderPlans = async (req, res) => {
    try {
        const { orderedIds } = req.body
        if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
            return errorResponse(res, "orderedIds must be a non-empty array.", 400)
        }
        await prisma.$transaction(
            orderedIds.map((subscription_plan_id, index) =>
                prisma.subscriptionPlan.update({
                    where: { subscription_plan_id },
                    data: { display_order: index, updatedBy: req.user?.id }
                })
            )
        )
        return successResponse(res, null, "Plans Reordered Successfully.")
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const deletePlan = async (req, res) => {
    try {
        await prisma.subscriptionPlan.update({
            where: { subscription_plan_id: req.params.id },
            data: { isactive: false, updatedBy: req.user?.id }
        })
        return successResponse(res, null, "Plan Deleted Successfully.")
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const hardDeletePlan = async (req, res) => {
    try {
        await prisma.subscriptionPlan.delete({ where: { subscription_plan_id: req.params.id } })
        return successResponse(res, null, "Plan Permanently Deleted Successfully.")
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { createPlan, getAllPlans, getPlanById, updatePlan, reorderPlans, deletePlan, hardDeletePlan }
