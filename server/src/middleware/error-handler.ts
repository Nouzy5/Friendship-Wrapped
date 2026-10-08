import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { loggableUrl, logger } from "../lib/logger.js";
import { isVanishedRecordError } from "../lib/prisma.js";

export type ErrorResponseBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

/** Errors raised by express.json() carry an HTTP status and a `type`. */
function isBodyParserError(err: unknown): err is { status: number; type: string } {
  return typeof err === "object" && err !== null && "type" in err && "status" in err;
}

/**
 * The 4xx status of errors Express and its body parser raise for a bad request (a URL
 * that isn't valid percent-encoding, an unsupported charset or Content-Encoding, an upload
 * cut off half way), or null for anything else.
 */
function clientErrorStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null || !("status" in err)) return null;
  const { status } = err;
  return typeof status === "number" && status >= 400 && status < 500 ? status : null;
}

function toResponse(err: unknown): { status: number; body: ErrorResponseBody } {
  if (err instanceof AppError) {
    const body: ErrorResponseBody = { error: { code: err.code, message: err.message } };
    if (err.details !== undefined) body.error.details = err.details;
    return { status: err.status, body };
  }

  if (err instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "The request contains invalid data",
          details: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
      },
    };
  }

  if (isBodyParserError(err)) {
    if (err.type === "entity.parse.failed") {
      return { status: 400, body: { error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } } };
    }
    if (err.type === "entity.too.large") {
      return { status: 413, body: { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" } } };
    }
  }

  // Checked and then gone by the time of the write, e.g. reacting to a photo as it's deleted.
  if (isVanishedRecordError(err)) {
    return {
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "That's no longer there. It may have just been deleted." } },
    };
  }

  const status = clientErrorStatus(err);
  if (status !== null) {
    const code = status === 415 ? "UNSUPPORTED_MEDIA_TYPE" : "BAD_REQUEST";
    return { status, body: { error: { code, message: "The request couldn't be read" } } };
  }

  return {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
  };
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const { status, body } = toResponse(err);

  if (status >= 500) {
    logger.error(`${req.method} ${loggableUrl(req)} failed`, err);
  } else if (isVanishedRecordError(err)) {
    // Expected from races, but worth seeing if it ever comes from a bug instead.
    logger.warn(`${req.method} ${loggableUrl(req)}: ${(err as Error).message.trim().split("\n").at(-1)}`);
  }

  res.status(status).json(body);
};
