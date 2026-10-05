import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { acceptInvite, previewInvite } from "./invites.controller.js";

/** Mounted at /api/invites. Creating and resetting invites lives under /api/groups/:groupId/invites. */
export const invitesRouter = Router();

invitesRouter.get("/:token", previewInvite);
invitesRouter.post("/:token/accept", requireAuth, acceptInvite);
