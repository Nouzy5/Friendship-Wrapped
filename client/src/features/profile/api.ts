import { apiRequest } from "../../lib/api-client";
import type { User } from "../auth/types";

export type UpdateProfileInput = { displayName: string };

export async function updateProfile(input: UpdateProfileInput): Promise<User> {
  const { user } = await apiRequest<{ user: User }>("/users/me", { method: "PATCH", body: input });
  return user;
}

export async function uploadAvatar(image: File): Promise<User> {
  const form = new FormData();
  form.append("avatar", image);
  const { user } = await apiRequest<{ user: User }>("/users/me/avatar", { method: "PUT", body: form });
  return user;
}

/** Permanently deletes your account and everything you posted; your password confirms it. */
export async function deleteAccount(password: string): Promise<void> {
  await apiRequest<null>("/users/me", { method: "DELETE", body: { password } });
}

export async function removeAvatar(): Promise<User> {
  const { user } = await apiRequest<{ user: User }>("/users/me/avatar", { method: "DELETE" });
  return user;
}
