const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");

const healthzRoutes = require("./routes/healthz");
const userRoutes = require("./routes/user");
const courseRoutes = require("./routes/courses");
const syllabusRoutes = require("./routes/syllabus");

const app = express();
const metadataRoute = require("./routes/metadata");
app.use(metadataRoute);

// Security headers
app.use(helmet());

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode >= 400 && res.statusCode < 500 && body && body.error) {
      const msg = body.message ? ` | ${body.message}` : "";
      console.log(`[APP] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${body.error}${msg}`);
    }
    return originalJson(body);
  };

  next();
});

// Status labels for nicer access logs for terminal
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


app.use("/healthz", healthzRoutes);


app.use((req, res, next) => {
  const isSyllabusUpload =
    req.method === "POST" &&
    /^\/v1\/courses\/[^/]+\/syllabus$/.test(req.path);

  const isJsonBodyEndpoint =
    (req.originalUrl.startsWith("/v1/user") || req.originalUrl.startsWith("/v1/courses")) &&
    ["POST", "PUT"].includes(req.method) &&
    !isSyllabusUpload; // ✅ allow multipart/form-data for syllabus upload

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
  return res.status(404).json({
    error: "Not Found",
    message: "Resource not found",
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);

  return res.status(500).json({
    error: "Internal Server Error",
    message: "An unexpected error occurred",
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  });
});

module.exports = app;
