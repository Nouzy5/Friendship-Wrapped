import { createHash, randomBytes } from "node:crypto";

/** A URL-safe random token: `bytes` of entropy, base64url-encoded. */
export function generateToken(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Hex SHA-256. Bearer tokens (sessions, invites) are stored only as this hash,
 * so a database leak doesn't hand out working tokens.
 */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
