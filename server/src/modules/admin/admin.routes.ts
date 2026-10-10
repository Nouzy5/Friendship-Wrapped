import { Router } from "express";
import { rateLimit } from "../../middleware/rate-limit.js";
import { currentUser, requireAdmin, requireAuth } from "../auth/auth.middleware.js";
import {
  deleteGroup,
  deleteUser,
  getGroup,
  getOverview,
  getSystem,
  getUser,
  listGroups,
  listReports,
  listUsers,
  markEmailVerified,
  removeGroupMember,
  resendVerification,
  signOutEverywhere,
  testEmail,
} from "./admin.controller.js";

// A real email goes out each time, so the test button can't be held down.
const testEmailRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  key: (req) => currentUser(req).id,
  message: "That's enough test emails for now. Try again in a few minutes.",
});

/** Everything under /api/admin is for the server's owner only (see `requireAdmin`). */
export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/overview", getOverview);

adminRouter.get("/users", listUsers);
adminRouter.get("/users/:userId", getUser);
adminRouter.post("/users/:userId/verify-email", markEmailVerified);
adminRouter.post("/users/:userId/resend-verification", resendVerification);
adminRouter.post("/users/:userId/sign-out", signOutEverywhere);
adminRouter.delete("/users/:userId", deleteUser);

adminRouter.get("/groups", listGroups);
adminRouter.get("/groups/:groupId", getGroup);
adminRouter.delete("/groups/:groupId/members/:userId", removeGroupMember);
adminRouter.delete("/groups/:groupId", deleteGroup);

adminRouter.get("/reports", listReports);

adminRouter.get("/system", getSystem);
adminRouter.post("/system/test-email", testEmailRateLimit, testEmail);
