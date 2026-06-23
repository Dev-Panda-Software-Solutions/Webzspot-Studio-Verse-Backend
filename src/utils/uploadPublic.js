const multer = require("multer")
const path = require("path")
const fs = require("fs")

const ALLOWED_EXTS = [".jpeg", ".jpg", ".png", ".webp"]
const ALLOWED_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, "../../uploads/profiles/temp")
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

// 2MB limit — tighter than authenticated upload since no auth check
const uploadPublic = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } })

module.exports = uploadPublic
