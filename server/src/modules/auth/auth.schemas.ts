import { z } from "zod";
import { displayNameSchema, emailSchema, usernameSchema } from "../users/users.schemas.js";

// Length is what matters (NIST 800-63B); the upper bound caps hashing cost.
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});

const loginIdentifier = z.string().trim().toLowerCase().max(254);

/**
 * Deliberately lenient: login must not reveal the registration rules. The person signs in with
 * their email address, or the username they've always had; `username` is the field's older name
 * and still works, so a client that predates email keeps signing in.
 */
export const loginSchema = z
  .object({
    identifier: loginIdentifier.optional(),
    username: loginIdentifier.optional(),
    password: z.string().min(1, "Enter your password").max(128),
  })
  .refine((input) => Boolean(input.identifier ?? input.username), {
    message: "Enter your email address",
    path: ["identifier"],
  })
  .transform(({ identifier, username, password }) => ({ identifier: (identifier || username)!, password }));

/** PUT /users/me/password. The new password follows the registration rules. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(128),
  newPassword: passwordSchema,
});

/** PUT /auth/email: the new address, confirmed with the password. */
export const changeEmailSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password to confirm").max(128),
});

/** POST /auth/verify-email: the token from the emailed link (a 32-byte base64url string). */
export const verifyEmailSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "This link isn't valid"),
});

export const sessionParamsSchema = z.object({ sessionId: z.string().regex(/^[0-9a-f]{16}$/, "Invalid session id") });

export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type LoginInput = z.output<typeof loginSchema>;
