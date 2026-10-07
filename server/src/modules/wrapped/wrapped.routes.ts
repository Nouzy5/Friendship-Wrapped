import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { listWrapped } from "./wrapped.controller.js";

/** A single Wrapped lives under its group (groups.routes); this lists all of yours. */
export const wrappedRouter = Router();

wrappedRouter.use(requireAuth);

wrappedRouter.get("/", listWrapped);
