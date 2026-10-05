import type { RequestHandler } from "express";
import { currentUser } from "../auth/auth.middleware.js";
import { createGroupSchema, groupParamsSchema, memberParamsSchema, updateGroupSchema } from "./groups.schemas.js";
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

export const leaveGroup: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const result = await groupsService.leaveGroup(groupId, currentUser(req).id);
  res.json(result);
};
