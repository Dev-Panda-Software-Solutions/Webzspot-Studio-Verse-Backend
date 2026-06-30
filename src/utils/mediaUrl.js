const s3Storage = require("./s3Storage")

// Short-lived on purpose — the frontend re-requests the list (gallery/favourites)
// to get fresh URLs well before this expires, so the bucket can stay private
// and media never has to be proxied/streamed through this server.
const MEDIA_URL_TTL_SECONDS = Math.max(10, parseInt(process.env.MEDIA_PRESIGN_EXPIRES_SECONDS) || 30)

// Strips the raw storage path off a media row and replaces it with a fresh
// pre-signed S3 URL. Legacy non-S3 (local disk) media gets media_url: null.
const withMediaUrl = async (media) => {
    if (!media) return media
    const { compressed_server_path, media_server_path, ...rest } = media
    const storagePath = compressed_server_path || media_server_path
    const media_url = storagePath && s3Storage.isS3Path(storagePath)
        ? await s3Storage.getPresignedUrl(storagePath, MEDIA_URL_TTL_SECONDS)
        : null
    return { ...rest, media_url }
}

const withMediaUrls = (items) => Promise.all((items || []).map(withMediaUrl))

module.exports = { withMediaUrl, withMediaUrls, MEDIA_URL_TTL_SECONDS }
