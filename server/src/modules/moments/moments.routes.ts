import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { deleteMoment, endMoment, getMoment, listMomentPhotos } from "./moments.controller.js";

/** Moments are listed, started and looked up as open under their group (groups.routes); this is for acting on one. */
export const momentsRouter = Router();

momentsRouter.use(requireAuth);

momentsRouter.get("/:momentId", getMoment);
momentsRouter.post("/:momentId/end", endMoment);
momentsRouter.delete("/:momentId", deleteMoment);
momentsRouter.get("/:momentId/photos", listMomentPhotos);
