import type { Request, Response } from "express";
import multer from "multer";
import { AppError, badRequest } from "./errors.js";

export const MAX_UPLOAD_MB = 20;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
    files: 1,
    fields: 4,
    fieldSize: 4 * 1024,
    parts: 6,
  },
});

export type ImageUpload = {
  file: Buffer | undefined;
  /** The multipart text fields, still unvalidated. */
  fields: Record<string, unknown>;
};

function toUploadError(error: unknown, field: string): AppError {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return new AppError(413, "FILE_TOO_LARGE", `Photos can be at most ${MAX_UPLOAD_MB} MB`);
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE" || error.code === "LIMIT_FILE_COUNT") {
      return badRequest(`Upload exactly one image, in the “${field}” field`);
    }
  }
  return badRequest("The upload couldn't be read. Please try again.");
}

/**
 * Reads a multipart/form-data body holding at most one file, in `field`, into memory.
 * Called from controllers (not as route middleware) so authorization runs before a
 * large body is accepted.
 */
export function readImageUpload(req: Request, res: Response, field: string): Promise<ImageUpload> {
  return new Promise((resolve, reject) => {
    upload.single(field)(req, res, (error: unknown) => {
      if (error) {
        reject(toUploadError(error, field));
        return;
      }
      resolve({ file: req.file?.buffer, fields: { ...req.body } });
    });
  });
}
