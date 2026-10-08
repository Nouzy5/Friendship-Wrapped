import type { RequestHandler } from "express";
import { currentUser } from "../auth/auth.middleware.js";
import { updateSettingsSchema } from "./settings.schemas.js";
import * as settingsService from "./settings.service.js";

/** GET /users/me/settings */
export const getSettings: RequestHandler = async (req, res) => {
  res.json({ settings: await settingsService.getSettings(currentUser(req).id) });
};

/** PATCH /users/me/settings — any subset of the settings, nested objects included. */
export const updateSettings: RequestHandler = async (req, res) => {
  const input = updateSettingsSchema.parse(req.body);
  res.json({ settings: await settingsService.updateSettings(currentUser(req).id, input) });
};
