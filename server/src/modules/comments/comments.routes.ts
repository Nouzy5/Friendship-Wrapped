import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { deleteComment } from "./comments.controller.js";

/** Comments are listed and added under their photo (photos.routes); this is for acting on one. */
export const commentsRouter = Router();

commentsRouter.use(requireAuth);

commentsRouter.delete("/:commentId", deleteComment);
