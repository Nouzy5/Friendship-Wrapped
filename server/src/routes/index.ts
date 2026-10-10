import { Router } from "express";
import { requireSameOrigin } from "../middleware/same-origin.js";
import { adminRouter } from "../modules/admin/admin.routes.js";
import { albumsRouter } from "../modules/albums/albums.routes.js";
import { authRouter } from "../modules/auth/auth.routes.js";
import { commentsRouter } from "../modules/comments/comments.routes.js";
import { groupsRouter } from "../modules/groups/groups.routes.js";
import { healthRouter } from "../modules/health/health.routes.js";
import { invitesRouter } from "../modules/invites/invites.routes.js";
import { momentsRouter } from "../modules/moments/moments.routes.js";
import { notificationsRouter } from "../modules/notifications/notifications.routes.js";
import { photosRouter } from "../modules/photos/photos.routes.js";
import { reportsRouter } from "../modules/reports/reports.routes.js";
import { usersRouter } from "../modules/users/users.routes.js";
import { wrappedRouter } from "../modules/wrapped/wrapped.routes.js";

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
apiRouter.use("/admin", adminRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/groups", groupsRouter);
apiRouter.use("/invites", invitesRouter);
apiRouter.use("/photos", photosRouter);
apiRouter.use("/comments", commentsRouter);
apiRouter.use("/albums", albumsRouter);
apiRouter.use("/moments", momentsRouter);
apiRouter.use("/wrapped", wrappedRouter);
apiRouter.use("/reports", reportsRouter);
apiRouter.use("/notifications", notificationsRouter);
