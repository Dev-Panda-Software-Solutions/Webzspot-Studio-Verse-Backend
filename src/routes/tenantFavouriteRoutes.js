const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { addTenantFavourite, removeTenantFavourite, getTenantFavouritesForEvent } = require("../controllers/tenantFavouriteController")

router.post("/", verifyToken, requireRole("ADMIN", "SUPER_ADMIN"), addTenantFavourite)
router.get("/event/:event_id", verifyToken, requireRole("ADMIN", "SUPER_ADMIN"), getTenantFavouritesForEvent)
router.delete("/:id", verifyToken, requireRole("ADMIN", "SUPER_ADMIN"), removeTenantFavourite)

module.exports = router
