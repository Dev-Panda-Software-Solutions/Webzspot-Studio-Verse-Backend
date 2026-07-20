const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { createUserValidator, createUserInEventValidator } = require("../validators/userValidators")
const { validate } = require("../middleware/validate")
const { getAllUsers, getUserById, createUser, createUserInEvent, updateUser, deleteUser, hardDeleteUser, restoreUser } = require("../controllers/userController")

router.post("/", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), createUserValidator, validate, createUser)
router.post("/create-in-event", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), createUserInEventValidator, validate, createUserInEvent)
router.get("/", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), getAllUsers)
router.get("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), getUserById)
router.put("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), updateUser)
router.put("/:id/restore", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), restoreUser)
router.delete("/hard/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), hardDeleteUser)
router.delete("/:id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), deleteUser)

module.exports = router