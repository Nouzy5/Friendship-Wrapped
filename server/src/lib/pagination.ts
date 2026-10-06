import { z } from "zod";

/**
 * Keyset pagination for lists ordered by (createdAt, id). The cursor is the last item
 * of the previous page, sent as "<createdAt ms>_<id>", so pages don't shift when new
 * items arrive and every page is an index range scan, however deep.
 */
export type Cursor = { createdAt: Date; id: string };

export function encodeCursor({ createdAt, id }: Cursor): string {
  return `${createdAt.getTime()}_${id}`;
}

const cursorSchema = z
  .string()
  .regex(/^\d{1,15}_[0-9a-f-]{36}$/, "Invalid cursor")
  .transform((value): Cursor => {
    const [ms, id] = value.split("_") as [string, string];
    return { createdAt: new Date(Number(ms)), id };
  });

/** `?cursor=…&limit=…` */
export function pageQuerySchema(defaultLimit: number, maxLimit = 50) {
  return z.object({
    cursor: cursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
  });
}

/** Rows before the cursor in (createdAt, id) order. Spread into a Prisma `where`. */
export function before({ createdAt, id }: Cursor) {
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}

/** Rows after the cursor in (createdAt, id) order. Spread into a Prisma `where`. */
export function after({ createdAt, id }: Cursor) {
  return { OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: id } }] };
}

/** Repositories fetch `limit + 1` rows: the extra one only says whether there's another page. */
export function toPage<T extends Cursor>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}
