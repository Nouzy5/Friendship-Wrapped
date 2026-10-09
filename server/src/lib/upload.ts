import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream";
import multer from "multer";
import { AppError, badRequest } from "./errors.js";
import { logger } from "./logger.js";

export const MAX_UPLOAD_MB = 20;
/** The largest video upload. It is converted on the server, so what is kept is much smaller. */
export const MAX_VIDEO_UPLOAD_MB = 100;

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
      if (error.field === "video") {
        return new AppError(413, "FILE_TOO_LARGE", `Videos can be at most ${MAX_VIDEO_UPLOAD_MB} MB`);
      }
      const what = field === "avatar" ? "Pictures" : "Photos";
      return new AppError(413, "FILE_TOO_LARGE", `${what} can be at most ${MAX_UPLOAD_MB} MB`);
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

// ---------------------------------------------------------------------------------------
// Photos and videos

/**
 * A photo (or a video's poster picture) stays in memory, at most MAX_UPLOAD_MB. A video is
 * written to a temporary file as it arrives, so a big one never sits in memory. The file is
 * the caller's to delete (`MediaUpload.discard`).
 */
const mediaStorage: multer.StorageEngine = {
  _handleFile(_req, file, callback) {
    if (file.fieldname === "video") {
      const path = join(tmpdir(), `fw-upload-${randomUUID()}`);
      const out = createWriteStream(path);
      pipeline(file.stream, out, (error) => {
        if (error) {
          void rm(path, { force: true });
          callback(error);
          return;
        }
        callback(null, { path, size: out.bytesWritten });
      });
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    file.stream.on("data", (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_UPLOAD_MB * 1024 * 1024) {
        done = true;
        file.stream.resume();
        callback(new multer.MulterError("LIMIT_FILE_SIZE", file.fieldname));
        return;
      }
      chunks.push(chunk);
    });
    file.stream.on("end", () => {
      if (done) return;
      done = true;
      callback(null, { buffer: Buffer.concat(chunks), size });
    });
    file.stream.on("error", (error) => {
      if (done) return;
      done = true;
      callback(error);
    });
  },
  _removeFile(_req, file, callback) {
    if (!file.path) {
      callback(null);
      return;
    }
    // Done before the request is answered, so a refused upload has left nothing behind by then.
    rm(file.path, { force: true }).then(
      () => callback(null),
      (error: unknown) => callback(error as Error),
    );
  },
};

const mediaUpload = multer({
  storage: mediaStorage,
  limits: {
    fileSize: MAX_VIDEO_UPLOAD_MB * 1024 * 1024,
    files: 2,
    fields: 6,
    fieldSize: 4 * 1024,
    parts: 10,
  },
}).fields([
  { name: "photo", maxCount: 1 },
  { name: "video", maxCount: 1 },
]);

export type MediaUpload = {
  /** The photo, or the still picture sent with a video. */
  photo: Buffer | undefined;
  /** The video, in a temporary file. */
  video: { path: string; size: number } | undefined;
  /** The multipart text fields, still unvalidated. */
  fields: Record<string, unknown>;
  /** Deletes the temporary file. Call it when done, however it went. */
  discard: () => Promise<void>;
};

/**
 * Reads a multipart/form-data body holding a photo in `photo`, a video in `video`, or both (a
 * video with its own still picture). Called from controllers (not as route middleware) so
 * authorization runs before a large body is accepted.
 */
export function readMediaUpload(req: Request, res: Response): Promise<MediaUpload> {
  return new Promise((resolve, reject) => {
    mediaUpload(req, res, (error: unknown) => {
      const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
      const video = files.video?.[0];
      const discard = async () => {
        if (video?.path) await rm(video.path, { force: true });
      };
      if (error) {
        void discard();
        reject(toUploadError(error, "photo"));
        return;
      }
      resolve({
        photo: files.photo?.[0]?.buffer,
        video: video?.path ? { path: video.path, size: video.size } : undefined,
        fields: { ...req.body },
        discard,
      });
    });
  });
}

/**
 * Removes temporary video files that a crash or a restart left behind. Only those older than
 * `maxAgeMs` are touched, so an upload or conversion still going on is never disturbed.
 */
export async function sweepStaleUploads(maxAgeMs = 60 * 60 * 1000): Promise<void> {
  try {
    const folder = tmpdir();
    for (const name of await readdir(folder)) {
      if (!name.startsWith("fw-upload-") && !name.startsWith("fw-video-")) continue;
      const path = join(folder, name);
      const info = await stat(path).catch(() => null);
      if (info && Date.now() - info.mtimeMs > maxAgeMs) await rm(path, { recursive: true, force: true });
    }
  } catch (error) {
    logger.warn("Couldn't clear old temporary upload files", error);
  }
}
