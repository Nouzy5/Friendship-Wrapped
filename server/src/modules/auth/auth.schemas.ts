import { z } from "zod";
import { displayNameSchema, usernameSchema } from "../users/users.schemas.js";

// Length is what matters (NIST 800-63B); the upper bound caps hashing cost.
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

export const registerSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});

// Deliberately lenient: login must not reveal the registration rules.
export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Enter your username").max(64),
  password: z.string().min(1, "Enter your password").max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
