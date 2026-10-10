import { z } from "zod";
import { idSchema } from "../../lib/ids.js";
import { pageQuerySchema } from "../../lib/pagination.js";

const searchSchema = z.string().trim().max(100).optional();

/** GET /admin/users?q=&filter=&cursor=&limit= */
export const listUsersQuerySchema = pageQuerySchema(25, 100).extend({
  q: searchSchema,
  filter: z.enum(["all", "verified", "unverified", "no-email"]).default("all"),
});

/** GET /admin/groups?q=&cursor=&limit= */
export const listGroupsQuerySchema = pageQuerySchema(25, 100).extend({ q: searchSchema });

/** GET /admin/reports?cursor=&limit= */
export const listReportsQuerySchema = pageQuerySchema(25, 100);

export const userParamsSchema = z.object({ userId: idSchema });
export const groupParamsSchema = z.object({ groupId: idSchema });
export const groupMemberParamsSchema = z.object({ groupId: idSchema, userId: idSchema });

/** Deleting something for good asks for its name, as GitHub does: a slip of the finger can't do it. */
export const confirmDeleteSchema = z.object({ confirm: z.string().min(1, "Type the name to confirm").max(100) });

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type ListGroupsQuery = z.infer<typeof listGroupsQuerySchema>;
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
