import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { createInvite, resetInvites } from "../invites/invites.controller.js";
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
