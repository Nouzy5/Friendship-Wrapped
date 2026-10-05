import type { Response } from "supertest";
import { prisma } from "../src/lib/prisma.js";

/** Deletes all rows, children before parents. */
export async function resetDatabase(): Promise<void> {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

export const testUser = {
  username: "alice",
  displayName: "Alice",
  password: "correct horse battery staple",
};

/** The full `Set-Cookie` header for the session cookie, if the response set one. */
export function sessionSetCookie(res: Response): string | undefined {
  const header: unknown = res.headers["set-cookie"];
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  return cookies.find((cookie) => cookie.startsWith("fw_session="));
}

/** Just the `name=value` pair, ready to send back in a `Cookie` header. */
export function sessionCookiePair(res: Response): string {
  const cookie = sessionSetCookie(res)?.split(";")[0];
  if (!cookie) throw new Error("Response did not set a session cookie");
  return cookie;
}
