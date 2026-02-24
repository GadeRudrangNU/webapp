function requireVerified(req, res, next) {
    if (!req.user) return next(); // requireAuth should run first
    if (req.user.is_verified === false) {
        return res.status(403).json({
            error: "Forbidden",
            message: "Account is not verified",
            timestamp: new Date().toISOString(),
            path: req.originalUrl,
        });
    }
    return next();
}

module.exports = { requireVerified };