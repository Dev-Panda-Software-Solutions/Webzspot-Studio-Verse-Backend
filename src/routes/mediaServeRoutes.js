const express = require("express")
const router = express.Router()
const { verifyToken } = require("../middleware/authMiddleware")
const { requireRole } = require("../middleware/roleMiddleware")
const { getMediaToken, serveMedia, downloadUserFavouritesAsZip, downloadTenantFavouritesAsZip } = require("../controllers/mediaServeController")

router.get("/token/:media_id", verifyToken, getMediaToken)
router.get("/serve/:token", serveMedia)
router.get("/view/:token", serveMedia)
router.get("/download-zip/:event_id/:user_id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), downloadUserFavouritesAsZip)
router.get("/download-studio-zip/:event_id", verifyToken, requireRole("SUPER_ADMIN", "ADMIN"), downloadTenantFavouritesAsZip)

module.exports = router
