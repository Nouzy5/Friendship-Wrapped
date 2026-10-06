import type { RequestHandler } from "express";
import { currentUser } from "../auth/auth.middleware.js";
import { photoParamsSchema } from "../photos/photos.schemas.js";
import { commentParamsSchema, createCommentSchema, listCommentsQuerySchema } from "./comments.schemas.js";
import * as commentsService from "./comments.service.js";

/** GET /photos/:photoId/comments — oldest first, `{ comments, nextCursor }`. */
export const listComments: RequestHandler = async (req, res) => {
  const { photoId } = photoParamsSchema.parse(req.params);
  const query = listCommentsQuerySchema.parse(req.query);
  res.json(await commentsService.listComments(photoId, currentUser(req).id, query));
};

/** POST /photos/:photoId/comments — `{ body }`. */
export const addComment: RequestHandler = async (req, res) => {
  const { photoId } = photoParamsSchema.parse(req.params);
  const { body } = createCommentSchema.parse(req.body);
  const comment = await commentsService.addComment(photoId, currentUser(req).id, body);
  res.status(201).json({ comment });
};

/** DELETE /comments/:commentId */
export const deleteComment: RequestHandler = async (req, res) => {
  const { commentId } = commentParamsSchema.parse(req.params);
  await commentsService.deleteComment(commentId, currentUser(req).id);
  res.status(204).end();
};
