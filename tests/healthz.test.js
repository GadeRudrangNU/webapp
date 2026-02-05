const request = require("supertest");
const app = require("../src/app");

describe("Healthz API", () => {
  it("GET /healthz returns 200", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
  });

  it("GET /healthz sets no-cache headers", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);

    expect(res.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
    expect(res.headers["pragma"]).toBe("no-cache");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("HEAD /healthz is explicitly rejected with 405", async () => {
    const res = await request(app).head("/healthz");
    expect(res.status).toBe(405);
  });

  it("GET /healthz rejects query params with 400", async () => {
    const res = await request(app).get("/healthz?x=1");
    expect(res.status).toBe(400);
  });

  it("GET /healthz rejects request body (content-length > 0) with 400", async () => {
    const res = await request(app)
      .get("/healthz")
      .set("Content-Type", "text/plain")
      .send("hello");
    expect(res.status).toBe(400);
  });

  it("POST /healthz returns 405 (method not allowed)", async () => {
    const res = await request(app).post("/healthz");
    expect(res.status).toBe(405);
  });

  it("PUT /healthz returns 405 (method not allowed)", async () => {
    const res = await request(app).put("/healthz");
    expect(res.status).toBe(405);
  });
});
