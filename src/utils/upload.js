const multer = require("multer")
const path = require("path")
const fs = require("fs")

const ALLOWED_EXTS = [".jpeg", ".jpg", ".png", ".gif", ".mp4", ".mov", ".avi", ".mkv", ".mp3", ".wav"]
const ALLOWED_MIMES = [
    "image/jpeg", "image/jpg", "image/png", "image/gif",
    "video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska",
    "audio/mpeg", "audio/wav", "audio/x-wav"
]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const eventId = req.body.event_id || req.query.event_id

        // Validate event_id is a UUID before using it in the filesystem path
        if (!eventId || !UUID_REGEX.test(eventId)) {
            return cb(new Error("Invalid or missing event_id. Must be a valid UUID."), false)
        }

        const dir = path.join(__dirname, "../../uploads/events", eventId, "original")
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
    const mimeOk = ALLOWED_MIMES.includes(file.mimetype)
    const extOk = ALLOWED_EXTS.includes(ext)
    if (mimeOk && extOk) {
        cb(null, true)
    } else {
        cb(new Error("File type not allowed. Only images (jpeg, jpg, png, gif), videos (mp4, mov, avi, mkv) and audio (mp3, wav) are accepted."), false)
    }
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 500 * 1024 * 1024 } })

module.exports = upload
