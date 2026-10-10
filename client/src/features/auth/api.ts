import { apiRequest } from "../../lib/api-client";
import type { User } from "./types";

/** The identifier is an email address, or the username the account has always had. */
export type LoginInput = { identifier: string; password: string };
export type RegisterInput = { email: string; username: string; displayName: string; password: string };

export async function fetchSessionUser(signal?: AbortSignal): Promise<User | null> {
  const { user } = await apiRequest<{ user: User | null }>("/auth/session", { signal });
  return user;
}

export async function login(input: LoginInput): Promise<User> {
  const { user } = await apiRequest<{ user: User }>("/auth/login", { method: "POST", body: input });
  return user;
}

export async function register(input: RegisterInput): Promise<User> {
  const { user } = await apiRequest<{ user: User }>("/auth/register", { method: "POST", body: input });
  return user;
}

export async function logout(): Promise<void> {
  await apiRequest<null>("/auth/logout", { method: "POST" });
}

/** Confirms an address with the token from the emailed link. Works signed in or out. */
export async function verifyEmail(token: string): Promise<{ email: string }> {
  return apiRequest<{ email: string }>("/auth/verify-email", { method: "POST", body: { token } });
}

/** Emails the link again (the server allows one a minute). */
export async function resendVerificationEmail(): Promise<void> {
  await apiRequest<null>("/auth/email/resend", { method: "POST" });
}

/** Sets or changes the address; it's unverified again until the new link is opened. */
export async function changeEmail(input: { email: string; password: string }): Promise<User> {
  const { user } = await apiRequest<{ user: User }>("/auth/email", { method: "PUT", body: input });
  return user;
}
