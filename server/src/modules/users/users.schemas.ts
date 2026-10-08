import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-z0-9._]+$/, "Use only letters, numbers, periods and underscores")
  .refine((value) => !value.startsWith(".") && !value.endsWith(".") && !value.includes(".."), {
    message: "Periods can't be at the start, the end, or next to each other",
  });

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name is required")
  .max(40, "Display name must be at most 40 characters")
  .regex(/^[^\p{Cc}]+$/u, "Display name contains invalid characters");

/** Either or both. Usernames follow the registration rules. */
export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    username: usernameSchema.optional(),
  })
  .refine((input) => input.displayName !== undefined || input.username !== undefined, {
    message: "Nothing to update",
  });

export const userParamsSchema = z.object({ userId: z.uuid() });

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
