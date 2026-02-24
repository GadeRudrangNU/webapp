const request = require("supertest");
const path = require("path");
const fs = require("fs");
const app = require("../src/app");
const { prisma } = require("../src/db");

// Mock S3 service so we don't touch AWS in tests
jest.mock("../src/services/s3", () => ({
    putObject: jest.fn().mockResolvedValue(undefined),
    deleteObject: jest.fn().mockResolvedValue(undefined),
}));

function basicAuthHeader(username, password) {
    const token = Buffer.from(`${username}:${password}`).toString("base64");
    return `Basic ${token}`;
}

async function createTestUser({ username, password = "StrongPassw0rd!", first_name = "Test", last_name = "User" }) {
    const res = await request(app)
        .post("/v1/user")
        .set("Content-Type", "application/json")
        .send({ first_name, last_name, username, password });

    if (res.status !== 201 && res.status !== 409) {
        throw new Error(`User create failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
}

describe("Syllabus API", () => {
    const username = "syllabus.tester@example.com";
    const password = "StrongPassw0rd!";
    let auth;

    let courseId;

    beforeAll(async () => {
        // ✅ Add these two lines
        process.env.S3_BUCKET_NAME = "test-bucket";
        process.env.AWS_REGION = "us-east-1";

        auth = basicAuthHeader(username, password);
        await createTestUser({ username, password });

        // Create a course for syllabus tests
        const course = await prisma.course.create({
            data: {
                department_code: "TEST",
                number: "2001",
                title: "Syllabus Course",
                credit_hours: 4,
                classification: "core",
            },
        });
        courseId = course.id;
    });

    afterAll(async () => {
        // Cleanup syllabus then course
        await prisma.syllabus.deleteMany({ where: { course_id: courseId } });
        await prisma.course.deleteMany({ where: { id: courseId } });

        await prisma.$disconnect();
    });

    test("GET /v1/courses/:course_id/syllabus returns 404 when none exists", async () => {
        const res = await request(app)
            .get(`/v1/courses/${courseId}/syllabus`)
            .set("Authorization", auth);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty("error");
    });

    test("POST /v1/courses/:course_id/syllabus requires multipart file (400)", async () => {
        const res = await request(app)
            .post(`/v1/courses/${courseId}/syllabus`)
            .set("Authorization", auth);

        // your route checks req.file => 400
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty("error");
    });

    test("POST /v1/courses/:course_id/syllabus uploads file (201) + sets has_syllabus true", async () => {
        // create a small temp file buffer
        const tmpPath = path.join(__dirname, "tmp_syllabus.pdf");
        fs.writeFileSync(tmpPath, Buffer.from("%PDF-1.4 test pdf"));

        const res = await request(app)
            .post(`/v1/courses/${courseId}/syllabus`)
            .set("Authorization", auth)
            .attach("file", tmpPath, { contentType: "application/pdf" });

        fs.unlinkSync(tmpPath);

        expect(res.status).toBe(201);
        expect(res.headers.location).toBe(`/v1/courses/${courseId}/syllabus`);
        expect(res.body).toHaveProperty("id");
        expect(res.body.course_id).toBe(courseId);
        expect(res.body).toHaveProperty("s3_bucket_name");
        expect(res.body).toHaveProperty("s3_object_key");

        const course = await prisma.course.findUnique({ where: { id: courseId } });
        expect(course.has_syllabus).toBe(true);
    });

    test("POST /v1/courses/:course_id/syllabus returns 409 if already exists", async () => {
        const tmpPath = path.join(__dirname, "tmp_syllabus2.pdf");
        fs.writeFileSync(tmpPath, Buffer.from("%PDF-1.4 another"));

        const res = await request(app)
            .post(`/v1/courses/${courseId}/syllabus`)
            .set("Authorization", auth)
            .attach("file", tmpPath, { contentType: "application/pdf" });

        fs.unlinkSync(tmpPath);

        expect(res.status).toBe(409);
        expect(res.body).toHaveProperty("error");
    });

    test("GET /v1/courses/:course_id/syllabus returns 200 with metadata", async () => {
        const res = await request(app)
            .get(`/v1/courses/${courseId}/syllabus`)
            .set("Authorization", auth);

        expect(res.status).toBe(200);
        expect(res.body.course_id).toBe(courseId);
        expect(res.body).toHaveProperty("url");
    });

    test("DELETE /v1/courses/:course_id/syllabus returns 204 and sets has_syllabus false", async () => {
        const res = await request(app)
            .delete(`/v1/courses/${courseId}/syllabus`)
            .set("Authorization", auth);

        expect(res.status).toBe(204);

        const course = await prisma.course.findUnique({ where: { id: courseId } });
        expect(course.has_syllabus).toBe(false);
    });

    test("DELETE /v1/courses/:course_id/syllabus returns 404 after deletion", async () => {
        const res = await request(app)
            .delete(`/v1/courses/${courseId}/syllabus`)
            .set("Authorization", auth);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty("error");
    });
});