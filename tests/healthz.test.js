const request = require("supertest");
const app = require("../src/app");

describe("Healthz API – Basic Availability", () => {
  it("GET /healthz returns 200", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
  });
});
