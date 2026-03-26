const fs = require("fs");
const path = require("path");
const os = require("os");
const winston = require("winston");

const logFile =
    process.env.APP_LOG_FILE ||
    (process.env.NODE_ENV === "test"
        ? path.join(os.tmpdir(), "csye6225-webapp.log")
        : "/var/log/csye6225/webapp.log");

const logDir = path.dirname(logFile);

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    defaultMeta: {
        logger: "csye6225"
    },
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.printf((info) => {
            const logEntry = {
                timestamp: info.timestamp,
                level: String(info.level || "").toUpperCase(),
                logger: info.logger || "csye6225",
                message: info.message
            };

            if (info.module) logEntry.module = info.module;
            if (info.function) logEntry.function = info.function;
            if (info.line) logEntry.line = info.line;
            if (info.method) logEntry.method = info.method;
            if (info.path) logEntry.path = info.path;
            if (info.statusCode) logEntry.statusCode = info.statusCode;
            if (info.duration_ms !== undefined) logEntry.duration_ms = info.duration_ms;
            if (info.details) logEntry.details = info.details;
            if (info.port !== undefined) logEntry.port = info.port;
            if (info.stack) logEntry.stack = info.stack;

            return JSON.stringify(logEntry);
        })
    ),
    transports: [
        new winston.transports.File({ filename: logFile })
    ]
});

module.exports = logger;