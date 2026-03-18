const fs = require("fs");
const path = require("path");
const winston = require("winston");

const logFile = process.env.APP_LOG_FILE || "/var/log/csye6225/webapp.log";
const logDir = path.dirname(logFile);

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, stack }) => {
            return `${timestamp} [${level.toUpperCase()}] ${stack || message}`;
        })
    ),
    transports: [
        new winston.transports.File({ filename: logFile })
    ]
});

module.exports = logger;