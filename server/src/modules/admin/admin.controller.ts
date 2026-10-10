import type { Request, RequestHandler } from "express";
import { forbidden } from "../../lib/errors.js";
import { currentUser } from "../auth/auth.middleware.js";
import { getSystemReport, sendTestEmail } from "./admin-system.service.js";
import {
  confirmDeleteSchema,
  groupMemberParamsSchema,
  groupParamsSchema,
  listGroupsQuerySchema,
  listReportsQuerySchema,
  listUsersQuerySchema,
  userParamsSchema,
} from "./admin.schemas.js";
import * as adminService from "./admin.service.js";

/** How the admin appears in the audit log. */
const adminName = (req: Request) => `@${currentUser(req).username}`;

export const getOverview: RequestHandler = async (_req, res) => {
  res.json(await adminService.getOverview());
};

export const listUsers: RequestHandler = async (req, res) => {
  res.json(await adminService.listUsers(listUsersQuerySchema.parse(req.query)));
};

export const getUser: RequestHandler = async (req, res) => {
  const { userId } = userParamsSchema.parse(req.params);
  res.json(await adminService.getUser(userId));
};

/** POST /admin/users/:userId/verify-email — marks the address verified by hand; answers with the account. */
export const markEmailVerified: RequestHandler = async (req, res) => {
  const { userId } = userParamsSchema.parse(req.params);
  await adminService.markEmailVerified(adminName(req), userId);
  res.json(await adminService.getUser(userId));
};

export const resendVerification: RequestHandler = async (req, res) => {
  const { userId } = userParamsSchema.parse(req.params);
  await adminService.resendVerification(adminName(req), userId);
  res.status(204).end();
};

export const signOutEverywhere: RequestHandler = async (req, res) => {
  const { userId } = userParamsSchema.parse(req.params);
  res.json(await adminService.signOutEverywhere(adminName(req), userId));
};

/** DELETE /admin/users/:userId — `{ confirm: "<their username>" }`. */
export const deleteUser: RequestHandler = async (req, res) => {
  const { userId } = userParamsSchema.parse(req.params);
  const { confirm } = confirmDeleteSchema.parse(req.body);
  await adminService.deleteUser(currentUser(req).id, adminName(req), userId, confirm);
  res.status(204).end();
};

export const listGroups: RequestHandler = async (req, res) => {
  res.json(await adminService.listGroups(listGroupsQuerySchema.parse(req.query)));
};

export const getGroup: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  res.json(await adminService.getGroup(groupId));
};

export const removeGroupMember: RequestHandler = async (req, res) => {
  const { groupId, userId } = groupMemberParamsSchema.parse(req.params);
  res.json(await adminService.removeMember(adminName(req), groupId, userId));
};

/** DELETE /admin/groups/:groupId — `{ confirm: "<the group's name>" }`. */
export const deleteGroup: RequestHandler = async (req, res) => {
  const { groupId } = groupParamsSchema.parse(req.params);
  const { confirm } = confirmDeleteSchema.parse(req.body);
  await adminService.deleteGroup(adminName(req), groupId, confirm);
  res.status(204).end();
};

export const listReports: RequestHandler = async (req, res) => {
  res.json(await adminService.listReports(listReportsQuerySchema.parse(req.query)));
};

export const getSystem: RequestHandler = async (_req, res) => {
  res.json(await getSystemReport());
};

/** POST /admin/system/test-email — sends a test email to the admin's own address. */
export const testEmail: RequestHandler = async (req, res) => {
  const { email } = currentUser(req);
  if (!email) throw forbidden("Your account has no email address");
  res.json(await sendTestEmail(email));
};
