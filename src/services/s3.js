const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

function getS3Client() {
    const region = process.env.AWS_REGION || "us-east-1";
    return new S3Client({ region });
}

async function putObject({ bucket, key, body, contentType }) {
    const s3 = getS3Client();
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
    }));
}

async function deleteObject({ bucket, key }) {
    const s3 = getS3Client();
    await s3.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
    }));
}

module.exports = { putObject, deleteObject };