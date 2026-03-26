const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");

const healthzRoutes = require("./routes/healthz");
const userRoutes = require("./routes/user");
const courseRoutes = require("./routes/courses");
const syllabusRoutes = require("./routes/syllabus");
const metadataRoute = require("./routes/metadata");

const logger = require("./utils/logger");
const { recordApiMetrics } = require("./utils/metrics");

const app = express();

// Security headers
app.use(helmet());

// Request logging + API metrics
app.use((req, res, next) => {
  const start = Date.now();

  logger.info("Incoming request", {
    module: "app",
    function: "request_middleware",
    method: req.method,
    path: req.originalUrl
  });

  res.on("finish", () => {
    const durationMs = Date.now() - start;

    logger.info("Request completed", {
      module: "app",
      function: "request_middleware",
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      duration_ms: durationMs
    });

    recordApiMetrics(req, durationMs);
  });

  next();
});

// Optional terminal access logs
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode >= 400 && res.statusCode < 500 && body && body.error) {
      logger.warn(body.error || "Client error response", {
        module: "app",
        function: "response_wrapper",
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        details: body.message || undefined
      });
    }
    return originalJson(body);
  };

  next();
});

morgan.token("statusLabel", (req, res) => {
  const map = {
    200: "OK",
    201: "CREATED",
    204: "NO_CONTENT",
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    415: "UNSUPPORTED_MEDIA_TYPE",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
  };
  return map[res.statusCode] || "";
});

app.use(morgan(":method :url :status :statusLabel :response-time ms"));

app.use(metadataRoute);
app.use("/healthz", healthzRoutes);

app.use((req, res, next) => {
  const isSyllabusUpload =
    req.method === "POST" &&
    /^\/v1\/courses\/[^/]+\/syllabus$/.test(req.path);

  const isJsonBodyEndpoint =
    (req.originalUrl.startsWith("/v1/user") || req.originalUrl.startsWith("/v1/courses")) &&
    ["POST", "PUT"].includes(req.method) &&
    !isSyllabusUpload;

  if (isJsonBodyEndpoint && !req.is("application/json")) {
    return res.status(415).json({
      error: "Unsupported Media Type",
      message: "Content-Type must be application/json",
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    });
  }

  return next();
});

app.use(express.json({ type: ["application/json", "*/json"] }));

// Handle malformed JSON
app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    logger.warn("Malformed JSON request body", {
      module: "app",
      function: "json_parser",
      method: req.method,
      path: req.originalUrl
    });

    return res.status(400).json({
      error: "Validation Error",
      message: "Malformed JSON request body",
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    });
  }
  return next(err);
});

// Routes
app.use("/v1/user", userRoutes);
app.use("/v1/courses", courseRoutes);
app.use("/v1/courses", syllabusRoutes);

// 404 handler
app.use((req, res) => {
  logger.warn("Resource not found", {
    module: "app",
    function: "not_found_handler",
    method: req.method,
    path: req.originalUrl
  });

  return res.status(404).json({
    error: "Not Found",
    message: "Resource not found",
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  });
});

// Final error handler
app.use((err, req, res, next) => {
  logger.error(err.message || "Unhandled error", {
    module: "app",
    function: "error_handler",
    method: req.method,
    path: req.originalUrl,
    stack: err.stack
  });

  if (res.headersSent) {
    return next(err);
  }

  return res.status(err.status || 500).json({
    error: "Internal Server Error",
    message: err.message || "An unexpected error occurred",
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  });
});

module.exports = app;