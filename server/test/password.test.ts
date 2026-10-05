import { describe, expect, it } from "vitest";
import { hashPassword, verifyDummyPassword, verifyPassword } from "../src/lib/password.js";

describe("password hashing", () => {
  it("verifies the correct password and rejects others", async () => {
    const hash = await hashPassword("hunter2-but-longer");

    expect(hash).toMatch(/^scrypt\$32768\$8\$3\$/);
    expect(hash).not.toContain("hunter2-but-longer");
    await expect(verifyPassword(hash, "hunter2-but-longer")).resolves.toBe(true);
    await expect(verifyPassword(hash, "hunter2-but-longeR")).resolves.toBe(false);
  });

  it("salts every hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same password"), hashPassword("same password")]);
    expect(a).not.toBe(b);
  });

  it("treats equivalent Unicode forms as the same password", async () => {
    const hash = await hashPassword("café-secret"); // é as one code point
    await expect(verifyPassword(hash, "café-secret")).resolves.toBe(true); // e + combining accent
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    await expect(verifyPassword("not-a-hash", "anything")).resolves.toBe(false);
    await expect(verifyPassword("scrypt$x$y$z$abc$def", "anything")).resolves.toBe(false);
  });

  it("dummy verification always fails", async () => {
    await expect(verifyDummyPassword("anything")).resolves.toBe(false);
  });
});
