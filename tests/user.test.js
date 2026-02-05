const request = require("supertest");
const app = require("../src/app");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function basicAuthHeader(username, password) {
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

describe("User API – Happy Path & Authentication", () => {
  const ts = Date.now();
  const user = {
    first_name: "Test",
    last_name: "User",
    username: `test+${ts}@example.com`,
    password: "Password123!"
  };

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { username: { contains: "test+" } }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("POST /v1/user creates user and returns 201 + Location header", async () => {
    const res = await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send(user);

    expect(res.status).toBe(201);
    expect(res.headers["location"]).toBe("/v1/user/self");

    expect(res.headers["content-type"]).toMatch(/json/i);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("username", user.username.toLowerCase());
    expect(res.body).not.toHaveProperty("password");
  });

  it("POST /v1/user normalizes username to lowercase", async () => {
    const mixed = {
      ...user,
      username: `TeSt+${ts}@Example.com`
    };

    const res = await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send(mixed);

    expect(res.status).toBe(201);
    expect(res.body.username).toBe(mixed.username.toLowerCase());
  });

  it("GET /v1/user/self without auth returns 401", async () => {
    const res = await request(app).get("/v1/user/self");
    expect(res.status).toBe(401);
  });

  it("GET /v1/user/self with valid auth returns 200 and no password", async () => {
    await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send(user);

    const res = await request(app)
      .get("/v1/user/self")
      .set("Authorization", basicAuthHeader(user.username, user.password));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("username", user.username.toLowerCase());
    expect(res.body).not.toHaveProperty("password");
  });
});
