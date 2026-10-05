import type { RequestHandler } from "express";
import { currentUser } from "../auth/auth.middleware.js";
import { updateProfileSchema } from "./users.schemas.js";
import * as usersService from "./users.service.js";

export const updateMe: RequestHandler = async (req, res) => {
  const input = updateProfileSchema.parse(req.body);
  const user = await usersService.updateProfile(currentUser(req).id, input);
  res.json({ user });
};
