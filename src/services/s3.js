const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { recordS3Timing } = require("../utils/metrics");

function getS3Client() {
    const region = process.env.AWS_REGION || "us-east-1";
    return new S3Client({ region });
}

async function putObject({ bucket, key, body, contentType }) {
    const s3 = getS3Client();
    const start = Date.now();

    try {
        await s3.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
            })
        );
    } finally {
        recordS3Timing("put_object", Date.now() - start);
    }
}

async function deleteObject({ bucket, key }) {
    const s3 = getS3Client();
    const start = Date.now();

    try {
        await s3.send(
            new DeleteObjectCommand({
                Bucket: bucket,
                Key: key,
            })
        );
    } finally {
        recordS3Timing("delete_object", Date.now() - start);
    }
}

module.exports = { putObject, deleteObject };