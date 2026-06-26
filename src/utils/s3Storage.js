const fs = require("fs")
const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand
} = require("@aws-sdk/client-s3")

const bucket = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-south-1"

const isConfigured = () => Boolean(
    bucket &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
)

const client = new S3Client({
    region,
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
        : undefined
})

const toS3Path = (key) => `s3://${bucket}/${key.replace(/^\/+/, "")}`

const getKeyFromS3Path = (s3Path) => {
    if (!s3Path || !s3Path.startsWith("s3://")) return null
    const withoutScheme = s3Path.slice("s3://".length)
    const slashIndex = withoutScheme.indexOf("/")
    if (slashIndex === -1) return null

    const pathBucket = withoutScheme.slice(0, slashIndex)
    const key = withoutScheme.slice(slashIndex + 1)
    if (bucket && pathBucket !== bucket) return null
    return key
}

const isS3Path = (filePath) => Boolean(getKeyFromS3Path(filePath))

const uploadFile = async ({ localPath, key, contentType }) => {
    if (!isConfigured()) throw new Error("S3 storage is not configured.")

    await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fs.createReadStream(localPath),
        ContentType: contentType || "application/octet-stream"
    }))

    return toS3Path(key)
}

const headObject = async (s3Path) => {
    const key = getKeyFromS3Path(s3Path)
    if (!key) return null

    return client.send(new HeadObjectCommand({
        Bucket: bucket,
        Key: key
    }))
}

const getObjectStream = async (s3Path, range) => {
    const key = getKeyFromS3Path(s3Path)
    if (!key) return null

    const result = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: range
    }))

    return result.Body
}

const deleteObject = async (s3Path) => {
    const key = getKeyFromS3Path(s3Path)
    if (!key || !isConfigured()) return

    await client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
    }))
}

const createMultipartUpload = async ({ key, contentType }) => {
    if (!isConfigured()) throw new Error("S3 storage is not configured.")

    const result = await client.send(new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType || "application/octet-stream"
    }))

    return { uploadId: result.UploadId, key, s3Path: toS3Path(key) }
}

const uploadPart = async ({ key, uploadId, partNumber, body }) => {
    if (!isConfigured()) throw new Error("S3 storage is not configured.")

    const result = await client.send(new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body
    }))

    return { PartNumber: partNumber, ETag: result.ETag }
}

const completeMultipartUpload = async ({ key, uploadId, parts }) => {
    if (!isConfigured()) throw new Error("S3 storage is not configured.")

    await client.send(new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
            Parts: parts
                .map(part => ({ PartNumber: Number(part.PartNumber), ETag: part.ETag }))
                .sort((a, b) => a.PartNumber - b.PartNumber)
        }
    }))

    return toS3Path(key)
}

const abortMultipartUpload = async ({ key, uploadId }) => {
    if (!isConfigured() || !key || !uploadId) return

    await client.send(new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId
    }))
}

module.exports = {
    isConfigured,
    isS3Path,
    uploadFile,
    headObject,
    getObjectStream,
    deleteObject,
    createMultipartUpload,
    uploadPart,
    completeMultipartUpload,
    abortMultipartUpload
}
