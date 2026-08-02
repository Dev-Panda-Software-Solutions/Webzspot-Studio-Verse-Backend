const multer = require("multer")
const path = require("path")
const fs = require("fs")

const ALLOWED_EXTS = [".jpeg", ".jpg", ".png", ".webp"]
const ALLOWED_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const eventId = req.body.event_id
        if (!eventId || !UUID_REGEX.test(eventId)) {
            return cb(new Error("Invalid or missing event_id. Must be a valid UUID."), false)
        }
        const dir = path.join(__dirname, "../../uploads/guests", eventId)
        fs.mkdirSync(dir, { recursive: true })
        cb(null, dir)
    },
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
        cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`)
    }
})

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ALLOWED_MIMES.includes(file.mimetype) && ALLOWED_EXTS.includes(ext)) {
        cb(null, true)
    } else {
        cb(new Error("Only image files are allowed (jpeg, jpg, png, webp)."), false)
    }
}

// Public, no-auth — guests self-register via QR code. 5MB limit is generous
// enough for a phone-camera selfie without opening the door to abuse.
const uploadGuestSelfie = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } })

module.exports = uploadGuestSelfie
