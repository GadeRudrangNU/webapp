const StatsD = require("hot-shots");

const client = new StatsD({
    host: process.env.STATSD_HOST || "127.0.0.1",
    port: Number(process.env.STATSD_PORT || 8125),
    errorHandler: (error) => {
        console.error("StatsD error:", error.message);
    }
});

function normalizePath(value) {
    return String(value || "unknown")
        .replace(/[{}]/g, "")
        .replace(/\/+/g, "/")
        .replace(/^\//, "")
        .replace(/\//g, "_")
        .replace(/[^a-zA-Z0-9_.-]/g, "_") || "root";
}

function recordApiMetrics(req, durationMs) {
    const routePath = req.route?.path || req.path || "unknown";
    const basePath = req.baseUrl || "";
    const metricPath = normalizePath(`${basePath}${routePath}`);

    client.increment(`api.${metricPath}.count`);
    client.timing(`api.${metricPath}.duration_ms`, durationMs);
}

function recordDbTiming(operation, durationMs) {
    const safeOperation = normalizePath(operation || "query");
    client.timing(`db.${safeOperation}.duration_ms`, durationMs);
}

function recordS3Timing(operation, durationMs) {
    const safeOperation = normalizePath(operation || "request");
    client.timing(`s3.${safeOperation}.duration_ms`, durationMs);
}

module.exports = {
    client,
    recordApiMetrics,
    recordDbTiming,
    recordS3Timing
};