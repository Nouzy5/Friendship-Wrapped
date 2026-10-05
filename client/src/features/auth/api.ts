import { apiRequest } from "../../lib/api-client";
import type { User } from "./types";

export type LoginInput = { username: string; password: string };
export type RegisterInput = { username: string; displayName: string; password: string };

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
