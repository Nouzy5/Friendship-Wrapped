import { Router } from "express";
import { rateLimit } from "../../middleware/rate-limit.js";
import { currentUser, requireAuth } from "../auth/auth.middleware.js";
import { deleteMe, getAvatar, removeAvatar, updateMe, uploadAvatar } from "./users.controller.js";

// Deleting needs the password, so limit guesses from a session left signed in somewhere.
const deleteAccountRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  key: (req) => currentUser(req).id,
  message: "Too many attempts. Please wait a few minutes and try again.",
});

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.patch("/me", updateMe);
usersRouter.delete("/me", deleteAccountRateLimit, deleteMe);
usersRouter.put("/me/avatar", uploadAvatar);
usersRouter.delete("/me/avatar", removeAvatar);
usersRouter.get("/:userId/avatar", getAvatar);
