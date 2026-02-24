const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { prisma } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireVerified } = require("../middleware/requireVerified");
const { putObject, deleteObject } = require("../services/s3");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function err(res, req, status, error, message) {
    return res.status(status).json({
        error,
        message,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
    });
}

router.use(requireAuth, requireVerified);

// GET /v1/courses/:course_id/syllabus
router.get("/:course_id/syllabus", async (req, res, next) => {
    try {
        const courseId = req.params.course_id;

        const course = await prisma.course.findUnique({ where: { id: courseId } });
        if (!course) return err(res, req, 404, "Not Found", "Course not found");

        const syllabus = await prisma.syllabus.findUnique({ where: { course_id: courseId } });
        if (!syllabus) return err(res, req, 404, "Not Found", "No syllabus found for this course");

        return res.status(200).json(syllabus);
    } catch (e) {
        return next(e);
    }
});

// POST /v1/courses/:course_id/syllabus (multipart/form-data file field name = file)
router.post("/:course_id/syllabus", upload.single("file"), async (req, res, next) => {
    try {
        const courseId = req.params.course_id;

        const course = await prisma.course.findUnique({ where: { id: courseId } });
        if (!course) return err(res, req, 404, "Not Found", "Course not found");

        const existing = await prisma.syllabus.findUnique({ where: { course_id: courseId } });
        if (existing) return err(res, req, 409, "Conflict", "Syllabus already exists for this course");

        if (!req.file || !req.file.buffer || req.file.size === 0) {
            return err(res, req, 400, "Bad Request", "A syllabus file must be provided in the 'file' form field");
        }

        const bucket = process.env.S3_BUCKET_NAME;
        if (!bucket) return err(res, req, 500, "Internal Server Error", "S3_BUCKET_NAME is not configured");

        const objectKey = `${courseId}/${uuidv4()}/${req.file.originalname}`;

        await putObject({
            bucket,
            key: objectKey,
            body: req.file.buffer,
            contentType: req.file.mimetype || "application/octet-stream",
        });

        const region = process.env.AWS_REGION || "us-east-1";
        const url = `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}`;

        const created = await prisma.$transaction(async (tx) => {
            const s = await tx.syllabus.create({
                data: {
                    course_id: courseId,
                    file_name: req.file.originalname,
                    s3_bucket_name: bucket,
                    s3_object_key: objectKey,
                    content_type: req.file.mimetype || "application/octet-stream",
                    file_size: req.file.size,
                    url,
                },
            });

            await tx.course.update({
                where: { id: courseId },
                data: { has_syllabus: true },
            });

            return s;
        });

        res.set("Location", `/v1/courses/${courseId}/syllabus`);
        return res.status(201).json(created);
    } catch (e) {
        return next(e);
    }
});

// DELETE /v1/courses/:course_id/syllabus
router.delete("/:course_id/syllabus", async (req, res, next) => {
    try {
        const courseId = req.params.course_id;

        const course = await prisma.course.findUnique({ where: { id: courseId } });
        if (!course) return err(res, req, 404, "Not Found", "Course not found");

        const syllabus = await prisma.syllabus.findUnique({ where: { course_id: courseId } });
        if (!syllabus) return err(res, req, 404, "Not Found", "No syllabus found for this course");

        await deleteObject({ bucket: syllabus.s3_bucket_name, key: syllabus.s3_object_key });

        await prisma.$transaction(async (tx) => {
            await tx.syllabus.delete({ where: { course_id: courseId } });
            await tx.course.update({ where: { id: courseId }, data: { has_syllabus: false } });
        });

        return res.status(204).send();
    } catch (e) {
        return next(e);
    }
});

module.exports = router;