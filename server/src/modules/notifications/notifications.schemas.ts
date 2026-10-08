import { z } from "zod";

/** The push service URL a browser subscribed with. Always https. */
const endpointSchema = z.url({ protocol: /^https$/, error: "Invalid push endpoint" }).max(700, "Push endpoint is too long");

const keySchema = z.string().min(1).max(255).regex(/^[A-Za-z0-9_=-]+$/, "Invalid key");

/** A PushSubscription as the browser serialises it (`subscription.toJSON()`; other fields are ignored). */
export const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({ p256dh: keySchema, auth: keySchema }),
});

export const unsubscribeSchema = z.object({ endpoint: endpointSchema });

export type SubscriptionInput = z.infer<typeof subscriptionSchema>;
