import type { Express } from "express";
import request, { type Response } from "supertest";
import { prisma } from "../src/lib/prisma.js";

/** Deletes all rows, children before parents. */
export async function resetDatabase(): Promise<void> {
  await prisma.inviteToken.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

export const testUser = {
  username: "alice",
  displayName: "Alice",
  password: "correct horse battery staple",
};

export type TestUser = { id: string; username: string; displayName: string };

/** Registers `username` and returns a cookie-keeping agent signed in as them (a "browser"). */
export async function signUp(app: Express, username: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({
    username,
    displayName: username[0]!.toUpperCase() + username.slice(1),
    password: testUser.password,
  });
  if (res.status !== 201) throw new Error(`signUp(${username}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.user as TestUser };
}

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
