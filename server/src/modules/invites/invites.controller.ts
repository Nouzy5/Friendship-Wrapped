import type { RequestHandler } from "express";
import { authenticate, currentUser } from "../auth/auth.middleware.js";
import { groupParamsSchema } from "../groups/groups.schemas.js";
import { inviteParamsSchema, myInviteParamsSchema } from "./invites.schemas.js";
import * as invitesService from "./invites.service.js";

export const createInvite: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const invite = await invitesService.createInvite(groupId, currentUser(req).id);
  res.status(201).json({ invite });
};

export const resetInvites: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  await invitesService.resetInvites(groupId, currentUser(req).id);
  res.status(204).end();
};

/** Public: the invite link itself is the credential. Signed-in viewers also learn if they're already in. */
export const previewInvite: RequestHandler = async (req, res) => {
  const { token } = inviteParamsSchema.parse(req.params);
  const viewer = await authenticate(req, res);
  const invite = await invitesService.previewInvite(token, viewer?.id ?? null);
  res.json({ invite });
};

/** GET /users/me/invites — the invite links you created that still work. */
export const listMyInvites: RequestHandler = async (req, res) => {
  res.json({ invites: await invitesService.listMyInvites(currentUser(req).id) });
};

/** DELETE /users/me/invites/:inviteId */
export const revokeMyInvite: RequestHandler = async (req, res) => {
  const { inviteId } = myInviteParamsSchema.parse(req.params);
  await invitesService.revokeMyInvite(currentUser(req).id, inviteId);
  res.status(204).end();
};

export const acceptInvite: RequestHandler = async (req, res) => {
  const { token } = inviteParamsSchema.parse(req.params);
  const group = await invitesService.acceptInvite(token, currentUser(req).id);
  res.json({ group });
};
