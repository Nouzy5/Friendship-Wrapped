import type { RequestHandler } from "express";
import { sendImage } from "../../lib/send-image.js";
import { readImageUpload } from "../../lib/upload.js";
import { currentUser } from "../auth/auth.middleware.js";
import {
  createGroupSchema,
  groupParamsSchema,
  memberParamsSchema,
  updateGroupSchema,
  updateMyMembershipSchema,
} from "./groups.schemas.js";
import * as groupsService from "./groups.service.js";

export const listMyGroups: RequestHandler = async (req, res) => {
  const groups = await groupsService.listMyGroups(currentUser(req).id);
  res.json({ groups });
};

export const createGroup: RequestHandler = async (req, res) => {
  const input = createGroupSchema.parse(req.body);
  const group = await groupsService.createGroup(currentUser(req).id, input);
  res.status(201).json({ group });
};

export const getGroup: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const group = await groupsService.getGroup(groupId, currentUser(req).id);
  res.json({ group });
};

export const updateGroup: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const input = updateGroupSchema.parse(req.body);
  const group = await groupsService.updateGroup(groupId, currentUser(req).id, input);
  res.json({ group });
};

export const listMembers: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const members = await groupsService.listMembers(groupId, currentUser(req).id);
  res.json({ members });
};

export const removeMember: RequestHandler = async (req, res) => {
  const { groupId, userId } = memberParamsSchema.parse(req.params);
  await groupsService.removeMember(groupId, currentUser(req).id, userId);
  res.status(204).end();
};

/** PATCH /groups/:groupId/members/me — `{ color?, muted? }` */
export const updateMyMembership: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const input = updateMyMembershipSchema.parse(req.body);
  const group = await groupsService.updateMyMembership(groupId, currentUser(req).id, input);
  res.json({ group });
};

/** PUT /groups/:groupId/avatar — multipart, the picture in the `avatar` field. Owner only. */
export const uploadGroupAvatar: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const userId = currentUser(req).id;

  await groupsService.assertCanEditGroup(groupId, userId);
  const { file } = await readImageUpload(req, res, "avatar");
  res.json({ group: await groupsService.setGroupAvatar(groupId, userId, file) });
};

export const removeGroupAvatar: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  res.json({ group: await groupsService.removeGroupAvatar(groupId, currentUser(req).id) });
};

export const getGroupAvatar: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  await sendImage(res, await groupsService.getGroupAvatarImage(groupId, currentUser(req).id));
};

export const leaveGroup: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const result = await groupsService.leaveGroup(groupId, currentUser(req).id);
  res.json(result);
};
