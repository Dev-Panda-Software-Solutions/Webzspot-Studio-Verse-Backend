const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { createSuperAdmin, getAllSuperAdmins, getSuperAdminById, updateSuperAdmin, deleteSuperAdmin, hardDeleteSuperAdmin, unlockAccount, resetAccountPassword } = require("../controllers/superAdminController")

router.post("/", verifyToken, requireRole("SUPER_ADMIN"), createSuperAdmin)
router.get("/", verifyToken, requireRole("SUPER_ADMIN"), getAllSuperAdmins)
router.get("/:id", verifyToken, requireRole("SUPER_ADMIN"), getSuperAdminById)
router.put("/:id", verifyToken, requireRole("SUPER_ADMIN"), updateSuperAdmin)
router.delete("/hard/:id", verifyToken, requireRole("SUPER_ADMIN"), hardDeleteSuperAdmin)
router.delete("/:id", verifyToken, requireRole("SUPER_ADMIN"), deleteSuperAdmin)
router.post("/unlock-account", verifyToken, requireRole("SUPER_ADMIN"), unlockAccount)
router.post("/reset-password", verifyToken, requireRole("SUPER_ADMIN"), resetAccountPassword)

module.exports = router
