const request = require("supertest");
const app = require("../src/app");
const { prisma } = require("../src/db");

function basicAuthHeader(username, password) {
    const token = Buffer.from(`${username}:${password}`).toString("base64");
    return `Basic ${token}`;
}

async function createTestUser({ username, password = "StrongPassw0rd!", first_name = "Test", last_name = "User" }) {
    // If your code hashes password inside route only, you should create user via API.
    // That’s safer because it matches real behavior.
    const res = await request(app)
        .post("/v1/user")
        .set("Content-Type", "application/json")
        .send({ first_name, last_name, username, password });

    // If user already exists from previous run, ignore.
    if (res.status !== 201 && res.status !== 409) {
        throw new Error(`User create failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
}

describe("Courses API", () => {
    const username = "course.tester@example.com";
    const password = "StrongPassw0rd!";

    let auth;

    beforeAll(async () => {
        auth = basicAuthHeader(username, password);
        await createTestUser({ username, password });

        // Clean courses created by this suite (by unique dept+number we use)
        await prisma.syllabus.deleteMany({
            where: {
                course: { department_code: "TEST", number: { in: ["1001", "1002"] } },
            },
        });
        await prisma.course.deleteMany({
            where: { department_code: "TEST", number: { in: ["1001", "1002"] } },
        });
    });

    afterAll(async () => {
        // Clean again
        await prisma.syllabus.deleteMany({
            where: {
                course: { department_code: "TEST", number: { in: ["1001", "1002"] } },
            },
        });
        await prisma.course.deleteMany({
            where: { department_code: "TEST", number: { in: ["1001", "1002"] } },
        });

        await prisma.$disconnect();
    });

    test("GET /v1/courses requires auth (401)", async () => {
        const res = await request(app).get("/v1/courses");
        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty("error");
    });

    test("POST /v1/courses returns 415 when Content-Type is not application/json", async () => {
        const res = await request(app)
            .post("/v1/courses")
            .set("Authorization", auth)
            .set("Content-Type", "text/plain")
            .send("not json");

        expect(res.status).toBe(415);
        expect(res.body).toHaveProperty("error");
    });

    test("POST /v1/courses creates a course (201) + Location header", async () => {
        const payload = {
            department_code: "TEST",
            number: "1001",
            title: "Test Course 1001",
            credit_hours: 4,
            classification: "core",
            description: "desc",
            prerequisites: "none",
        };

        const res = await request(app)
            .post("/v1/courses")
            .set("Authorization", auth)
            .set("Content-Type", "application/json")
            .send(payload);

        expect([201, 409]).toContain(res.status);

        if (res.status === 201) {
            expect(res.headers.location).toMatch(/^\/v1\/courses\/.+/);
            expect(res.body).toHaveProperty("id");
            expect(res.body.department_code).toBe("TEST");
            expect(res.body.number).toBe("1001");
            expect(res.body.has_syllabus).toBe(false);
        }
    });

    test("POST /v1/courses duplicate dept+number returns 409", async () => {
        // Ensure it exists
        await prisma.course.upsert({
            where: { department_code_number: { department_code: "TEST", number: "1002" } },
            create: {
                department_code: "TEST",
                number: "1002",
                title: "Test Course 1002",
                credit_hours: 3,
                classification: "elective",
            },
            update: {},
        });

        const res = await request(app)
            .post("/v1/courses")
            .set("Authorization", auth)
            .set("Content-Type", "application/json")
            .send({
                department_code: "TEST",
                number: "1002",
                title: "Duplicate",
                credit_hours: 3,
                classification: "elective",
            });

        expect(res.status).toBe(409);
        expect(res.body).toHaveProperty("error");
    });

    test("GET /v1/courses returns list (200)", async () => {
        const res = await request(app).get("/v1/courses").set("Authorization", auth);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test("GET /v1/courses/:course_id returns 404 for unknown id", async () => {
        const res = await request(app)
            .get("/v1/courses/00000000-0000-0000-0000-000000000000")
            .set("Authorization", auth);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty("error");
    });

    test("PUT /v1/courses/:course_id updates mutable fields (200)", async () => {
        const course = await prisma.course.create({
            data: {
                department_code: "TEST",
                number: "1009",
                title: "Old Title",
                credit_hours: 4,
                classification: "core",
            },
        });

        const res = await request(app)
            .put(`/v1/courses/${course.id}`)
            .set("Authorization", auth)
            .set("Content-Type", "application/json")
            .send({ title: "New Title" });

        expect(res.status).toBe(200);
        expect(res.body.title).toBe("New Title");

        await prisma.course.delete({ where: { id: course.id } });
    });

    test("PUT /v1/courses/:course_id rejects immutable field (400)", async () => {
        const course = await prisma.course.create({
            data: {
                department_code: "TEST",
                number: "1010",
                title: "Immutable Test",
                credit_hours: 4,
                classification: "core",
            },
        });

        const res = await request(app)
            .put(`/v1/courses/${course.id}`)
            .set("Authorization", auth)
            .set("Content-Type", "application/json")
            .send({ department_code: "NOPE" });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty("error");

        await prisma.course.delete({ where: { id: course.id } });
    });

    test("DELETE /v1/courses/:course_id returns 204 when no syllabus", async () => {
        const course = await prisma.course.create({
            data: {
                department_code: "TEST",
                number: "1011",
                title: "Delete Me",
                credit_hours: 4,
                classification: "core",
            },
        });

        const res = await request(app)
            .delete(`/v1/courses/${course.id}`)
            .set("Authorization", auth);

        expect(res.status).toBe(204);
    });
});