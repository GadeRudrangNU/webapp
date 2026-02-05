const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const { prisma } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "10", 10);
const USERNAME_MAX_LENGTH = parseInt(process.env.USERNAME_MAX_LENGTH || "254", 10);
const NAME_MAX_LENGTH = parseInt(process.env.NAME_MAX_LENGTH || "100", 10);
const PASSWORD_MAX_LENGTH = parseInt(process.env.PASSWORD_MAX_LENGTH || "72", 10);

const nameRegex = /^[A-Za-z][A-Za-z\s'-]*$/;

const createUserSchema = z
  .object({
    username: z
      .string()
      .trim()
      .email({ message: "Username must be a valid email address" })
      .max(USERNAME_MAX_LENGTH, { message: "Username is too long" }),
    password: z
      .string()
      .trim()
      .min(8, { message: "Password must be at least 8 characters" })
      .max(PASSWORD_MAX_LENGTH, { message: "Password must be at most 72 characters" }),
    first_name: z
      .string()
      .trim()
      .min(1, { message: "First name is required" })
      .max(NAME_MAX_LENGTH, { message: "First name is too long" })
      .regex(nameRegex, { message: "First name contains invalid characters" }),
    last_name: z
      .string()
      .trim()
      .min(1, { message: "Last name is required" })
      .max(NAME_MAX_LENGTH, { message: "Last name is too long" })
      .regex(nameRegex, { message: "Last name contains invalid characters" }),
  })
  .passthrough();

const updateUserSchema = z
  .object({
    first_name: z
      .string()
      .trim()
      .min(1, { message: "First name cannot be empty" })
      .max(NAME_MAX_LENGTH, { message: "First name is too long" })
      .regex(nameRegex, { message: "First name contains invalid characters" })
      .optional(),
    last_name: z
      .string()
      .trim()
      .min(1, { message: "Last name cannot be empty" })
      .max(NAME_MAX_LENGTH, { message: "Last name is too long" })
      .regex(nameRegex, { message: "Last name contains invalid characters" })
      .optional(),
    password: z
      .string()
      .trim()
      .min(8, { message: "Password must be at least 8 characters" })
      .max(PASSWORD_MAX_LENGTH, { message: "Password must be at most 72 characters" })
      .optional(),
  })
  .strict();

function swaggerError(res, req, status, error, message) {
  return res.status(status).json({
    error,
    message,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  });
}

function userResponse(u) {
  return {
    id: u.id,
    first_name: u.first_name,
    last_name: u.last_name,
    username: u.username,
    account_created: u.account_created.toISOString(),
    account_updated: u.account_updated.toISOString(),
  };
}

router.post("/", async (req, res, next) => {
  try {
    const missing = [];
    if (req.body?.username === undefined) missing.push("username");
    if (req.body?.password === undefined) missing.push("password");
    if (req.body?.first_name === undefined) missing.push("first_name");
    if (req.body?.last_name === undefined) missing.push("last_name");

    if (missing.length > 0) {
      return swaggerError(
        res,
        req,
        400,
        "Validation Error",
        `Missing required field(s): ${missing.join(", ")}`
      );
    }

    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || "Validation failed";
      return swaggerError(res, req, 400, "Validation Error", msg);
    }

    const { username, password, first_name, last_name } = parsed.data;
    const normalizedUsername = username.toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (existing) {
      return swaggerError(
        res,
        req,
        409,
        "Conflict",
        "A user with this email address already exists"
      );
    }

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        password: hash,
        first_name,
        last_name,
      },
    });

    res.set("Location", "/v1/user/self");

    return res.status(201).json(userResponse(user));
  } catch (err) {
    return next(err);
  }
});

router.get("/self", requireAuth, async (req, res) => {
  return res.status(200).json(userResponse(req.user));
});

router.put("/self", requireAuth, async (req, res, next) => {
  try {
    const allowed = new Set(["first_name", "last_name", "password"]);
    const keys = Object.keys(req.body || {});

    if (keys.length === 0) {
      return swaggerError(res, req, 400, "Bad Request", "Request body cannot be empty");
    }

    for (const key of keys) {
      if (!allowed.has(key)) {
        return swaggerError(res, req, 400, "Bad Request", `Field '${key}' cannot be updated`);
      }
    }

    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || "Validation failed";
      return swaggerError(res, req, 400, "Bad Request", msg);
    }

    const { first_name, last_name, password } = parsed.data;

    if (!first_name && !last_name && !password) {
      return swaggerError(
        res,
        req,
        400,
        "Bad Request",
        "At least one of first_name, last_name, password must be provided"
      );
    }

    const data = {};
    if (first_name) data.first_name = first_name;
    if (last_name) data.last_name = last_name;
    if (password) data.password = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { id: req.user.id },
      data,
    });

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
