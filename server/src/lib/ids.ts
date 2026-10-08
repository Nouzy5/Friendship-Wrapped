import { z } from "zod";

/**
 * A record id (a UUID) from a URL or a request body, lowercased as the database generates
 * them. MySQL compares ids without regard to case but code compares them as strings, so
 * "ABC…" and "abc…" must never reach either as two different ids: an owner could otherwise
 * remove themselves as if they were someone else, or files could be stored under a prefix
 * that deleting the group never sweeps.
 */
export const idSchema = z.uuid().transform((id) => id.toLowerCase());
