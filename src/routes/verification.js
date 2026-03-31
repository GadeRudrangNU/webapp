const express = require("express");
const { z } = require("zod");
const { prisma } = require("../db");

const router = express.Router();

function err(res, req, status, error, message) {
    return res.status(status).json({
        error,
        message,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
    });
}

const querySchema = z.object({
    email: z.string().trim().email(),
    token: z.string().uuid(),
});

router.get("/validateEmail", async (req, res, next) => {
    try {
        const parsed = querySchema.safeParse(req.query);

        if (!parsed.success) {
            return err(res, req, 400, "Bad Request", "Valid email and token are required");
        }

        const { email, token } = parsed.data;
        const normalizedEmail = email.toLowerCase();

        const user = await prisma.user.findUnique({
            where: { username: normalizedEmail },
        });

        if (!user) {
            return err(res, req, 400, "Bad Request", "Invalid verification link");
        }

        if (!user.verification_token || user.verification_token !== token) {
            return err(res, req, 400, "Bad Request", "Invalid verification link");
        }

        if (!user.verification_token_created) {
            return err(res, req, 400, "Bad Request", "Invalid verification link");
        }

        const ageMs =
            Date.now() - new Date(user.verification_token_created).getTime();

        const oneMinuteMs = 60 * 1000;

        if (ageMs > oneMinuteMs) {
            return err(res, req, 400, "Bad Request", "Verification link has expired");
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                is_verified: true,
                email_verified_at: new Date(),
                verification_token: null,
                verification_token_created: null,
            },
        });

        return res.status(200).json({
            message: "Email verified successfully",
            timestamp: new Date().toISOString(),
            path: req.originalUrl,
        });
    } catch (e) {
        return next(e);
    }
});

router.all("/validateEmail", (req, res) => {
    return err(res, req, 405, "Method Not Allowed", "Only GET is supported");
});

module.exports = router;