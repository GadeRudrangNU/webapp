const request = require("supertest");
const app = require("../src/app");

function expectErrorSchema(res) {
    expect(res.body).toHaveProperty("error");
    expect(res.body).toHaveProperty("message");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("path");
    expect(res.body.path).toBe("/v1/metadata");
}

describe("Metadata API", () => {
    it("GET /v1/metadata returns 503 locally (unsupported platform)", async () => {
        const res = await request(app).get("/v1/metadata");
        expect(res.status).toBe(503);
        expectErrorSchema(res);

        // required no-cache headers
        expect(res.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
        expect(res.headers["pragma"]).toBe("no-cache");
    });

    it("GET /v1/metadata rejects query params with 400", async () => {
        const res = await request(app).get("/v1/metadata?x=1");
        expect(res.status).toBe(400);
        expectErrorSchema(res);

        expect(res.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
        expect(res.headers["pragma"]).toBe("no-cache");
    });

    it("GET /v1/metadata rejects request body with 400", async () => {
        const res = await request(app)
            .get("/v1/metadata")
            .set("Content-Type", "text/plain")
            .send("hello");

        expect(res.status).toBe(400);
        expectErrorSchema(res);

        expect(res.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
        expect(res.headers["pragma"]).toBe("no-cache");
    });

    // All non-GET methods must be 405, including HEAD and OPTIONS
    const methods = ["post", "put", "delete", "patch", "head", "options"];

    for (const m of methods) {
        it(`${m.toUpperCase()} /v1/metadata returns 405`, async () => {
            const res = await request(app)[m]("/v1/metadata");
            expect(res.status).toBe(405);
            if (m !== "head") {
                expectErrorSchema(res);
            }

            expect(res.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
            expect(res.headers["pragma"]).toBe("no-cache");
        });
    }
});
