import { z } from "zod";

/** 16 random bytes, base64url-encoded. Anything else can't be a real invite. */
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export const inviteParamsSchema = z.object({ token: z.string() });

/**
 * How an invite is named in its creator's account: the first 16 hex digits of its stored
 * hash, matched together with the creator's id. Never the token, nor even the whole hash.
 */
export const publicInviteId = (hash: string) => hash.slice(0, 16);

export const myInviteParamsSchema = z.object({ inviteId: z.string().regex(/^[0-9a-f]{16}$/, "Invalid invite id") });
