const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { addFavourite, getFavouritesByUser, getEventFavouritesGroupedByUser, removeFavourite, hardDeleteFavourite } = require("../controllers/favouriteController")

router.post("/", verifyToken, requireRole("USER"), addFavourite)
router.get("/user/:user_id", verifyToken, getFavouritesByUser)
router.get("/user/:user_id/event/:event_id", verifyToken, getFavouritesByUser)
router.get("/event/:event_id/grouped", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), getEventFavouritesGroupedByUser)
router.delete("/hard/:id", verifyToken, requireRole("SUPER_ADMIN"), hardDeleteFavourite)
router.delete("/:id", verifyToken, removeFavourite)

module.exports = router
