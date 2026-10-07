import { Router } from "express";
import { createAlbum, listAlbums } from "../albums/albums.controller.js";
import { getYearStats } from "../analytics/analytics.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { createInvite, resetInvites } from "../invites/invites.controller.js";
import { listGroupPhotos, listOnThisDay, uploadPhoto } from "../photos/photos.controller.js";
import { getWrapped } from "../wrapped/wrapped.controller.js";
import {
  createGroup,
  getGroup,
  leaveGroup,
  listMembers,
  listMyGroups,
  removeMember,
  updateGroup,
} from "./groups.controller.js";

export const groupsRouter = Router();

groupsRouter.use(requireAuth);

groupsRouter.get("/", listMyGroups);
groupsRouter.post("/", createGroup);
groupsRouter.get("/:groupId", getGroup);
groupsRouter.patch("/:groupId", updateGroup);
groupsRouter.get("/:groupId/members", listMembers);
groupsRouter.delete("/:groupId/members/:userId", removeMember);
groupsRouter.post("/:groupId/leave", leaveGroup);
groupsRouter.post("/:groupId/invites", createInvite);
groupsRouter.delete("/:groupId/invites", resetInvites);
groupsRouter.get("/:groupId/photos", listGroupPhotos);
groupsRouter.post("/:groupId/photos", uploadPhoto);
groupsRouter.get("/:groupId/photos/on-this-day", listOnThisDay);
groupsRouter.get("/:groupId/albums", listAlbums);
groupsRouter.post("/:groupId/albums", createAlbum);
groupsRouter.get("/:groupId/stats/:year", getYearStats);
groupsRouter.get("/:groupId/wrapped/:year", getWrapped);
