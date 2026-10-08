import { Router } from "express";
import { rateLimit } from "../../middleware/rate-limit.js";
import {
  changePassword,
  listSessions,
  revokeOtherSessions,
  revokeSession,
} from "../auth/auth.controller.js";
import { currentUser, requireAuth } from "../auth/auth.middleware.js";
import { blockUser, listBlocked, unblockUser } from "../blocks/blocks.controller.js";
import { listMyInvites, revokeMyInvite } from "../invites/invites.controller.js";
import { getSettings, updateSettings } from "../settings/settings.controller.js";
import {
  deleteMe,
  downloadPhotoArchive,
  getAvatar,
  removeAvatar,
  updateMe,
  uploadAvatar,
} from "./users.controller.js";

// Deleting needs the password, so limit guesses from a session left signed in somewhere.
const deleteAccountRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  key: (req) => currentUser(req).id,
  message: "Too many attempts. Please wait a few minutes and try again.",
});

// Changing the password needs the current one: the same guessing limit.
const changePasswordRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  key: (req) => currentUser(req).id,
  message: "Too many attempts. Please wait a few minutes and try again.",
});

// Building an archive reads every photo someone posted from storage.
const archiveRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  key: (req) => currentUser(req).id,
  message: "You've downloaded your photos a few times already. Please try again in an hour.",
});

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.patch("/me", updateMe);
usersRouter.delete("/me", deleteAccountRateLimit, deleteMe);
usersRouter.put("/me/avatar", uploadAvatar);
usersRouter.delete("/me/avatar", removeAvatar);
usersRouter.put("/me/password", changePasswordRateLimit, changePassword);
usersRouter.get("/me/settings", getSettings);
usersRouter.patch("/me/settings", updateSettings);
usersRouter.get("/me/sessions", listSessions);
usersRouter.delete("/me/sessions", revokeOtherSessions);
usersRouter.delete("/me/sessions/:sessionId", revokeSession);
usersRouter.get("/me/photos/archive", archiveRateLimit, downloadPhotoArchive);
usersRouter.get("/me/invites", listMyInvites);
usersRouter.delete("/me/invites/:inviteId", revokeMyInvite);
usersRouter.get("/me/blocks", listBlocked);
usersRouter.put("/me/blocks/:userId", blockUser);
usersRouter.delete("/me/blocks/:userId", unblockUser);
usersRouter.get("/:userId/avatar", getAvatar);
