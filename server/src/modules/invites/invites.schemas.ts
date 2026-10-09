import { z } from "zod";

/** 16 random bytes, base64url-encoded. Anything else can't be a real invite. */
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export const inviteParamsSchema = z.object({ token: z.string() });

/** How long a new invite link can last, in days. */
export const INVITE_LIFETIMES_DAYS = [1, 7, 30] as const;
export const DEFAULT_INVITE_LIFETIME_DAYS = 7;

/** POST /groups/:groupId/invites. The body is optional: older apps send none and get the default. */
export const createInviteBodySchema = z.object({
  lifetimeDays: z
    .union(
      INVITE_LIFETIMES_DAYS.map((days) => z.literal(days)),
      { error: "Choose 1, 7 or 30 days" },
    )
    .default(DEFAULT_INVITE_LIFETIME_DAYS),
});

/**
 * How an invite is named in its creator's account: the first 16 hex digits of its stored
 * hash, matched together with the creator's id. Never the token, nor even the whole hash.
 */
export const publicInviteId = (hash: string) => hash.slice(0, 16);

export const myInviteParamsSchema = z.object({ inviteId: z.string().regex(/^[0-9a-f]{16}$/, "Invalid invite id") });
