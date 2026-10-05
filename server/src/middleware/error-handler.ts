import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

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
    logger.error(`${req.method} ${req.originalUrl} failed`, err);
  }

  res.status(status).json(body);
};
