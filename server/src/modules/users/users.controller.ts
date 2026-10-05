import type { RequestHandler } from "express";
import { sendImage } from "../../lib/send-image.js";
import { readImageUpload } from "../../lib/upload.js";
import { currentUser } from "../auth/auth.middleware.js";
import { updateProfileSchema, userParamsSchema } from "./users.schemas.js";
import * as usersService from "./users.service.js";

export const updateMe: RequestHandler = async (req, res) => {
  const input = updateProfileSchema.parse(req.body);
  const user = await usersService.updateProfile(currentUser(req).id, input);
  res.json({ user });
};

export const uploadAvatar: RequestHandler = async (req, res) => {
  const { file } = await readImageUpload(req, res, "avatar");
  const user = await usersService.setAvatar(currentUser(req).id, file);
  res.json({ user });
};

export const removeAvatar: RequestHandler = async (req, res) => {
  const user = await usersService.removeAvatar(currentUser(req).id);
  res.json({ user });
};

export const getAvatar: RequestHandler = async (req, res) => {
  const { userId } = userParamsSchema.parse(req.params);
  const image = await usersService.getAvatarImage(userId, currentUser(req).id);
  await sendImage(res, image);
};
