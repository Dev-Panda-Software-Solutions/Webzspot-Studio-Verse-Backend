const prisma = require("../utils/prismaClient")
const { successResponse, errorResponse, sanitizePrismaError } = require("../utils/response")
const { getPlatformSettings } = require("../utils/subscriptionAccess")

const getSettings = async (req, res) => {
    try {
        const settings = await getPlatformSettings()
        return successResponse(res, settings)
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

const updateSettings = async (req, res) => {
    try {
        const { trial_duration_days, trial_photo_quota } = req.body

        if (trial_duration_days !== undefined && (!Number.isInteger(trial_duration_days) || trial_duration_days < 1)) {
            return errorResponse(res, "trial_duration_days must be a positive integer.", 400)
        }
        if (trial_photo_quota !== undefined && (!Number.isInteger(trial_photo_quota) || trial_photo_quota < 1)) {
            return errorResponse(res, "trial_photo_quota must be a positive integer.", 400)
        }

        const current = await getPlatformSettings()
        const settings = await prisma.platformSettings.update({
            where: { platform_settings_id: current.platform_settings_id },
            data: {
                ...(trial_duration_days !== undefined ? { trial_duration_days } : {}),
                ...(trial_photo_quota !== undefined ? { trial_photo_quota } : {}),
                updatedBy: req.user?.id
            }
        })
        return successResponse(res, settings, "Platform Settings Updated Successfully.")
    } catch (err) {
        return errorResponse(res, sanitizePrismaError(err))
    }
}

module.exports = { getSettings, updateSettings }
