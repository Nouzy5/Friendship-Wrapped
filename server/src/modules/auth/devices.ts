import type { CookieOptions, Request, Response } from "express";
import { isProduction } from "../../config/env.js";
import { getCookie } from "../../lib/cookies.js";
import { isUniqueConstraintError } from "../../lib/prisma.js";
import { generateToken, sha256Hex } from "../../lib/tokens.js";
import * as repository from "./devices.repository.js";
import { deviceLabel } from "./session.dto.js";

/*
 * Telling a new device from one the person has used before, for the "new sign-in" email. A device is
 * whatever keeps a random id for us: a cookie in a browser, or the `X-Device-Id` header the iPhone
 * app sends (it keeps cookies out of the system store, so it can't use one). Only a hash of the id
 * is stored. A client that sends neither is treated as new every time, and gets a cookie.
 */

/** In production the __Host- prefix makes browsers insist on Secure, host-only and Path=/. */
export const DEVICE_COOKIE_NAME = isProduction ? "__Host-fw_device" : "fw_device";
export const DEVICE_HEADER = "x-device-id";

/** The longest a browser keeps a cookie. */
const DEVICE_COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
/** A person's devices beyond this many are forgotten, least recently used first, so the list can't grow without limit. */
const MAX_DEVICES_PER_USER = 50;

const cookieOptions: CookieOptions = { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/" };

/** The id this request's device sent, if it sent one in a form we accept. */
export function readDeviceId(req: Request): string | undefined {
  const candidates = [req.get(DEVICE_HEADER), getCookie(req.headers.cookie, DEVICE_COOKIE_NAME)];
  return candidates.find((value): value is string => typeof value === "string" && DEVICE_ID_PATTERN.test(value));
}

export function setDeviceCookie(res: Response, deviceId: string): void {
  res.cookie(DEVICE_COOKIE_NAME, deviceId, { ...cookieOptions, maxAge: DEVICE_COOKIE_MAX_AGE_MS });
}

/** What a request says about the device it came from. */
export type DeviceHint = { deviceId?: string; userAgent?: string };

export function deviceHint(req: Request): DeviceHint {
  return { deviceId: readDeviceId(req), userAgent: req.get("user-agent") };
}

/**
 * Notes a sign-in from a device. `isNew` is true the first time the account is used from it.
 * `deviceId` is what to hand back to a browser as its cookie: the id it sent, or a fresh one.
 */
export async function recordSignIn(userId: string, hint: DeviceHint): Promise<{ deviceId: string; label: string; isNew: boolean }> {
  const deviceId = hint.deviceId ?? generateToken(24);
  const id = sha256Hex(deviceId);
  const label = deviceLabel(hint.userAgent ?? null);

  if ((await repository.touchDevice(userId, id, label, new Date())) > 0) return { deviceId, label, isNew: false };

  try {
    await repository.createDevice({ userId, id, label });
  } catch (error) {
    // Two sign-ins from one new device at once: the other one recorded it, and told the person.
    if (isUniqueConstraintError(error)) return { deviceId, label, isNew: false };
    throw error;
  }

  const surplus = await repository.listSurplusDevices(userId, MAX_DEVICES_PER_USER);
  if (surplus.length > 0) await repository.deleteDevices(userId, surplus);
  return { deviceId, label, isNew: true };
}
