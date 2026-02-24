const basicAuth = require("basic-auth");
const bcrypt = require("bcrypt");
const { prisma } = require("../db");

function unauthorized(res, req) {
  // Swagger wants different realms depending on endpoint
  const realm = req.originalUrl.startsWith("/v1/courses")
    ? "Access to course catalog"
    : "Access to user account";

  res.set("WWW-Authenticate", `Basic realm="${realm}"`);

  return res.status(401).json({
    error: "Unauthorized",
    message: "Authentication credentials are missing or invalid",
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  });
}

async function requireAuth(req, res, next) {
  try {
    const creds = basicAuth(req);

    if (!creds || !creds.name || !creds.pass) {
      return unauthorized(res, req);
    }

    const username = creds.name.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) return unauthorized(res, req);

    const ok = await bcrypt.compare(creds.pass, user.password);
    if (!ok) return unauthorized(res, req);

    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAuth };
