import { Router } from "express";
import { requireSameOrigin } from "../middleware/same-origin.js";
import { authRouter } from "../modules/auth/auth.routes.js";
import { commentsRouter } from "../modules/comments/comments.routes.js";
import { groupsRouter } from "../modules/groups/groups.routes.js";
import { healthRouter } from "../modules/health/health.routes.js";
import { invitesRouter } from "../modules/invites/invites.routes.js";
import { photosRouter } from "../modules/photos/photos.routes.js";
import { usersRouter } from "../modules/users/users.routes.js";

/** Mounted at API_PREFIX (/api). Each feature module contributes its own router. */
export const apiRouter = Router();

// API responses are private and per-user; never let browsers or proxies cache them.
apiRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
apiRouter.use(requireSameOrigin);

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/groups", groupsRouter);
apiRouter.use("/invites", invitesRouter);
apiRouter.use("/photos", photosRouter);
apiRouter.use("/comments", commentsRouter);
