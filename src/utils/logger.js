const fs = require("fs");
const path = require("path");
const os = require("os");
const winston = require("winston");

// Decide log file path based on environment
const logFile =
    process.env.APP_LOG_FILE ||
    (process.env.NODE_ENV === "test"
        ? path.join(os.tmpdir(), "csye6225-webapp.log")
        : "/var/log/csye6225/webapp.log");

const logDir = path.dirname(logFile);

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Create logger
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