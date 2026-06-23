const multer = require("multer")
const path = require("path")
const fs = require("fs")

const ALLOWED_EXTS = [".jpeg", ".jpg", ".png", ".webp", ".gif"]
const ALLOWED_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]

const ROLE_FOLDER = {
    ADMIN: "tenants",
    USER: "users",
    SUPER_ADMIN: "super-admins"
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folder = ROLE_FOLDER[req.user?.role] || "others"
        const dir = path.join(__dirname, "../../uploads/profiles", folder)
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
        cb(new Error("Only image files are allowed for profile upload (jpeg, jpg, png, webp, gif)."), false)
    }
}

const uploadProfile = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } })

module.exports = uploadProfile
