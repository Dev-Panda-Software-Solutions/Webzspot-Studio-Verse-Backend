const multer = require("multer")
const path = require("path")
const fs = require("fs")

const ALLOWED_EXTS = [".jpeg", ".jpg", ".png", ".webp", ".gif"]
const ALLOWED_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, "../../uploads/covers")
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
        cb(new Error("Only image files are allowed for cover upload (jpeg, jpg, png, webp, gif)."), false)
    }
}

const uploadCover = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } })

module.exports = uploadCover
