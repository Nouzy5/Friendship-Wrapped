import { Router } from "express";
import { requireSameOrigin } from "../middleware/same-origin.js";
import { authRouter } from "../modules/auth/auth.routes.js";
import { healthRouter } from "../modules/health/health.routes.js";
import { usersRouter } from "../modules/users/users.routes.js";

/** Mounted at /api. Each feature module contributes its own router. */
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
