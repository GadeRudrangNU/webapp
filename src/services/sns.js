const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

function getSnsClient() {
    return new SNSClient({
        region: process.env.AWS_REGION || "us-east-1",
    });
}

async function publishUserVerification({ email, firstName, token }) {
    const topicArn = process.env.SNS_TOPIC_ARN;

    if (!topicArn) {
        throw new Error("SNS_TOPIC_ARN is not configured");
    }

    const sns = getSnsClient();

    await sns.send(
        new PublishCommand({
            TopicArn: topicArn,
            Message: JSON.stringify({
                email,
                firstName,
                token,
            }),
        })
    );
}

module.exports = { publishUserVerification };