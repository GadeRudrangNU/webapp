const express = require("express");
const { z } = require("zod");
const { prisma } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireVerified } = require("../middleware/requireVerified");

const router = express.Router();

function err(res, req, status, error, message) {
    return res.status(status).json({
        error,
        message,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
    });
}

const CourseCreateSchema = z.object({
    department_code: z.string().regex(/^[A-Z]{2,6}$/, "department_code must be 2–6 uppercase letters"),
    number: z.string().min(1).max(6),
    title: z.string().min(1).max(255),
    credit_hours: z.number().int().min(1).max(8),
    classification: z.enum(["core", "elective"]),
    description: z.string().max(2000).optional(),
    prerequisites: z.string().max(512).optional(),
}).strict();

const CourseUpdateSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    credit_hours: z.number().int().min(1).max(8).optional(),
    classification: z.enum(["core", "elective"]).optional(),
    description: z.string().max(2000).optional(),
    prerequisites: z.string().max(512).optional(),
}).strict();

const IMMUTABLE = new Set([
    "id", "department_code", "number", "has_syllabus", "date_created", "date_updated"
]);

router.use(requireAuth, requireVerified);

// GET /v1/courses
router.get("/", async (req, res, next) => {
    try {
        const courses = await prisma.course.findMany({
            orderBy: [{ department_code: "asc" }, { number: "asc" }],
        });
        return res.status(200).json(courses);
    } catch (e) {
        return next(e);
    }
});

// POST /v1/courses
router.post("/", async (req, res, next) => {
    try {
        // reject server-managed fields if present
        for (const k of ["id", "has_syllabus", "date_created", "date_updated"]) {
            if (req.body && Object.prototype.hasOwnProperty.call(req.body, k)) {
                return err(res, req, 400, "Bad Request", `Field '${k}' is not allowed`);
            }
        }

        const parsed = CourseCreateSchema.safeParse(req.body);
        if (!parsed.success) {
            const msg = parsed.error.issues[0]?.message || "Validation failed";
            return err(res, req, 400, "Validation Error", msg);
        }

        const data = parsed.data;

        try {
            const created = await prisma.course.create({ data });
            res.set("Location", `/v1/courses/${created.id}`);
            return res.status(201).json(created);
        } catch (e) {
            // composite unique violation
            if (e.code === "P2002") {
                return err(res, req, 409, "Conflict", `Course ${data.department_code} ${data.number} already exists`);
            }
            throw e;
        }
    } catch (e) {
        return next(e);
    }
});

// GET /v1/courses/:course_id
router.get("/:course_id", async (req, res, next) => {
    try {
        const course = await prisma.course.findUnique({ where: { id: req.params.course_id } });
        if (!course) return err(res, req, 404, "Not Found", "Course not found");
        return res.status(200).json(course);
    } catch (e) {
        return next(e);
    }
});

// PUT /v1/courses/:course_id
router.put("/:course_id", async (req, res, next) => {
    try {
        const keys = Object.keys(req.body || {});
        if (keys.length === 0) return err(res, req, 400, "Bad Request", "Request body cannot be empty");

        for (const k of keys) {
            if (IMMUTABLE.has(k)) {
                return err(res, req, 400, "Bad Request", `Field '${k}' is immutable`);
            }
        }

        const parsed = CourseUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
            const msg = parsed.error.issues[0]?.message || "Validation failed";
            return err(res, req, 400, "Validation Error", msg);
        }

        const data = parsed.data;
        if (Object.keys(data).length === 0) {
            return err(res, req, 400, "Bad Request", "At least one updatable field must be provided");
        }

        const existing = await prisma.course.findUnique({ where: { id: req.params.course_id } });
        if (!existing) return err(res, req, 404, "Not Found", "Course not found");

        const updated = await prisma.course.update({
            where: { id: req.params.course_id },
            data,
        });
        return res.status(200).json(updated);
    } catch (e) {
        return next(e);
    }
});

// DELETE /v1/courses/:course_id
router.delete("/:course_id", async (req, res, next) => {
    try {
        const course = await prisma.course.findUnique({ where: { id: req.params.course_id } });
        if (!course) return err(res, req, 404, "Not Found", "Course not found");

        if (course.has_syllabus) {
            return err(res, req, 409, "Conflict", "Course has a syllabus. Delete the syllabus first.");
        }

        await prisma.course.delete({ where: { id: req.params.course_id } });
        return res.status(204).send();
    } catch (e) {
        return next(e);
    }
});

module.exports = router;