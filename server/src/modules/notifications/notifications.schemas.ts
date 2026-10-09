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

/**
 * The token iOS gives the app, in hex: 32 bytes today, and Apple says it may grow to 100.
 * Stored lowercase, so one phone is one token however it was spelled.
 */
const deviceTokenSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{64,200}$/, "Invalid device token")
  .transform((token) => token.toLowerCase());

/** An iPhone registering for Apple push: the app reports which of Apple's servers its token is for. */
export const deviceSchema = z.object({
  token: deviceTokenSchema,
  environment: z.enum(["sandbox", "production"], { error: "environment must be sandbox or production" }),
});

export const removeDeviceSchema = z.object({ token: deviceTokenSchema });

export type DeviceInput = z.infer<typeof deviceSchema>;
