import { z } from "zod";

/** 16 random bytes, base64url-encoded. Anything else can't be a real invite. */
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export const inviteParamsSchema = z.object({ token: z.string() });
