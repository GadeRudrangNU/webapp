const request = require("supertest");
const app = require("../src/app");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function basicAuthHeader(username, password) {
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

describe("User API", () => {
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
    const mixed = { ...user, username: `TeSt+${ts}@Example.com` };

    const res = await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send(mixed);

    expect(res.status).toBe(201);
    expect(res.body.username).toBe(mixed.username.toLowerCase());
  });

  it("POST /v1/user rejects missing required fields with 400", async () => {
    const res = await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send({ username: user.username, password: user.password }); // missing names

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Validation Error");
    expect(res.body).toHaveProperty("message");
  });

  it("POST /v1/user rejects invalid email with 400", async () => {
    const res = await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send({ ...user, username: "bademail" });

    expect(res.status).toBe(400);
  });

  it("POST /v1/user rejects invalid first_name characters with 400", async () => {
    const res = await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send({ ...user, first_name: "Rudrang123" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Validation Error");
  });

  it("POST /v1/user rejects too-long password (>72) with 400", async () => {
    const longPass = "a".repeat(73);
    const res = await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send({ ...user, password: longPass });

    expect(res.status).toBe(400);
  });

  it("POST /v1/user rejects duplicate username with 409", async () => {
    await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send(user);

    const res2 = await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send(user);

    expect(res2.status).toBe(409);
    expect(res2.body).toHaveProperty("error", "Conflict");
  });

  it("POST /v1/user rejects non-JSON Content-Type with 415", async () => {
    const res = await request(app)
      .post("/v1/user")
      .set("Content-Type", "text/plain")
      .send(JSON.stringify(user));

    expect(res.status).toBe(415);
    expect(res.body).toHaveProperty("error", "Unsupported Media Type");
  });

  it("POST /v1/user rejects malformed JSON with 400", async () => {
    const res = await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send('{"first_name": "A",'); // broken JSON

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message", "Malformed JSON request body");
  });

  it("GET /v1/user/self without auth returns 401", async () => {
    const res = await request(app).get("/v1/user/self");
    expect(res.status).toBe(401);
  });

  it("GET /v1/user/self with invalid password returns 401", async () => {
    await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send(user);

    const res = await request(app)
      .get("/v1/user/self")
      .set("Authorization", basicAuthHeader(user.username, "WrongPass123!"));

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

  it("PUT /v1/user/self rejects empty body with 400", async () => {
    await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send(user);

    const res = await request(app)
      .put("/v1/user/self")
      .set("Authorization", basicAuthHeader(user.username, user.password))
      .set("Content-Type", "application/json")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Bad Request");
  });

  it("PUT /v1/user/self rejects read-only field (username) with 400", async () => {
    await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send(user);

    const res = await request(app)
      .put("/v1/user/self")
      .set("Authorization", basicAuthHeader(user.username, user.password))
      .set("Content-Type", "application/json")
      .send({ username: "new@example.com" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
  });

  it("PUT /v1/user/self rejects extra fields due to strict schema with 400", async () => {
    await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send(user);

    const res = await request(app)
      .put("/v1/user/self")
      .set("Authorization", basicAuthHeader(user.username, user.password))
      .set("Content-Type", "application/json")
      .send({ first_name: "Updated", university: "NEU" });

    expect(res.status).toBe(400);
  });

  it("PUT /v1/user/self rejects non-JSON Content-Type with 415", async () => {
    await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send(user);

    const res = await request(app)
      .put("/v1/user/self")
      .set("Authorization", basicAuthHeader(user.username, user.password))
      .set("Content-Type", "text/plain")
      .send("first_name=Updated");

    expect(res.status).toBe(415);
  });

  it("PUT /v1/user/self updates first_name and preserves last_name (204)", async () => {
    await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send(user);

    const updateRes = await request(app)
      .put("/v1/user/self")
      .set("Authorization", basicAuthHeader(user.username, user.password))
      .set("Content-Type", "application/json")
      .send({ first_name: "Updated" });

    expect(updateRes.status).toBe(204);

    const getRes = await request(app)
      .get("/v1/user/self")
      .set("Authorization", basicAuthHeader(user.username, user.password));

    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveProperty("first_name", "Updated");
    expect(getRes.body).toHaveProperty("last_name", user.last_name);
  });

  it("PUT /v1/user/self updates password; old password fails, new password works", async () => {
    await request(app)
      .post("/v1/user")
      .set("Content-Type", "application/json")
      .send(user);

    const newPassword = "NewPassword123!";

    const updateRes = await request(app)
      .put("/v1/user/self")
      .set("Authorization", basicAuthHeader(user.username, user.password))
      .set("Content-Type", "application/json")
      .send({ password: newPassword });

    expect(updateRes.status).toBe(204);

    const oldAuthRes = await request(app)
      .get("/v1/user/self")
      .set("Authorization", basicAuthHeader(user.username, user.password));

    expect(oldAuthRes.status).toBe(401);

    const newAuthRes = await request(app)
      .get("/v1/user/self")
      .set("Authorization", basicAuthHeader(user.username, newPassword));

    expect(newAuthRes.status).toBe(200);
  });

  it("Unknown route returns 404 JSON error", async () => {
    const res = await request(app).get("/v1/unknown");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error", "Not Found");
  });
});
