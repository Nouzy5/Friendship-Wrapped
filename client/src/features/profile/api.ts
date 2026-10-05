import { apiRequest } from "../../lib/api-client";
import type { User } from "../auth/types";

export type UpdateProfileInput = { displayName: string };

export async function updateProfile(input: UpdateProfileInput): Promise<User> {
  const { user } = await apiRequest<{ user: User }>("/users/me", { method: "PATCH", body: input });
  return user;
}
