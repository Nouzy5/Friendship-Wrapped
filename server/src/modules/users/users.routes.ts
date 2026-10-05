import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { updateMe } from "./users.controller.js";

export const usersRouter = Router();

usersRouter.patch("/me", requireAuth, updateMe);
