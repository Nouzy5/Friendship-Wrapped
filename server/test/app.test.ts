import request from "supertest";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/health", () => {
  it("reports the API, database and object storage as healthy", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toMatchObject({
      status: "ok",
      checks: { database: { status: "ok" }, storage: { status: "ok" } },
    });
    expect(res.body.checks.database.latencyMs).toEqual(expect.any(Number));
    expect(res.body.checks.storage.latencyMs).toEqual(expect.any(Number));
    expect(Date.parse(res.body.timestamp)).not.toBeNaN();
  });

  it("sets security headers", async () => {
    const res = await request(app).get("/api/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  describe("when the database is unreachable", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("responds 503 with DATABASE_UNAVAILABLE", async () => {
      vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

      const res = await request(app).get("/api/health");

      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        error: { code: "DATABASE_UNAVAILABLE", message: "The database is unreachable" },
      });
    });
  });
});

describe("error handling", () => {
  it("returns a JSON 404 envelope for unknown routes", async () => {
    const res = await request(app).get("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", message: "Route GET /api/does-not-exist does not exist" },
    });
  });

  it("rejects malformed JSON bodies with a 400", async () => {
    const res = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send("{ not json");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("rejects oversized JSON bodies with a 413", async () => {
    const res = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ blob: "x".repeat(200_000) }));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
