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

/** PUT /users/me/password. The new password follows the registration rules. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(128),
  newPassword: passwordSchema,
});

export const sessionParamsSchema = z.object({ sessionId: z.string().regex(/^[0-9a-f]{16}$/, "Invalid session id") });

export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
