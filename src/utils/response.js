const sanitizePrismaError = (err) => {
    if (!err?.code) return "An unexpected error occurred. Please try again."
    switch (err.code) {
        case "P2002": return "A record with this value already exists. Please use a different value."
        case "P2003": return "Related record not found. Check the IDs you provided."
        case "P2025": return "Record not found."
        case "P2014": return "The change you are trying to make would violate a required relation."
        default: return "A database error occurred. Please try again."
    }
}

const successResponse = (res, data, message = "Success", statusCode = 200) => {
    return res.status(statusCode).json({ success: true, message, data })
}

const errorResponse = (res, message = "Error", statusCode = 500) => {
    return res.status(statusCode).json({ success: false, message, data: null })
}

module.exports = { successResponse, errorResponse, sanitizePrismaError }
