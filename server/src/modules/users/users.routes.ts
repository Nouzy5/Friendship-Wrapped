import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { getAvatar, removeAvatar, updateMe, uploadAvatar } from "./users.controller.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.patch("/me", updateMe);
usersRouter.put("/me/avatar", uploadAvatar);
usersRouter.delete("/me/avatar", removeAvatar);
usersRouter.get("/:userId/avatar", getAvatar);
