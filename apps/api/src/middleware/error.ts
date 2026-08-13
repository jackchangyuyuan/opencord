import type { ErrorRequestHandler } from "express";
import { z, ZodError } from "zod";

import { AppError } from "../lib/errors.js";

interface ClientBodyError {
  status: number;
  body: { code: string; message: string };
}

const BODY_ERRORS: Record<string, ClientBodyError> = {
  "entity.too.large": {
    status: 413,
    body: { code: "BODY_TOO_LARGE", message: "Request body is too large" },
  },
  "entity.parse.failed": {
    status: 400,
    body: { code: "MALFORMED_BODY", message: "Request body is not valid" },
  },
  "encoding.unsupported": {
    status: 415,
    body: {
      code: "UNSUPPORTED_ENCODING",
      message: "Request body uses an unsupported content encoding",
    },
  },
  "charset.unsupported": {
    status: 415,
    body: {
      code: "UNSUPPORTED_CHARSET",
      message: "Request body uses an unsupported charset",
    },
  },
};

function clientBodyError(error: unknown): ClientBodyError | undefined {
  if (!(error instanceof Error) || !("type" in error)) {
    return undefined;
  }

  return typeof error.type === "string" ? BODY_ERRORS[error.type] : undefined;
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    req.log.warn({ err: error, code: error.code }, "Request failed");
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  const rejected = clientBodyError(error);

  if (rejected !== undefined) {
    req.log.warn(
      { code: rejected.body.code, length: req.get("content-length") },
      "Request body rejected",
    );
    res.status(rejected.status).json({ error: rejected.body });
    return;
  }

  if (error instanceof ZodError) {
    req.log.warn({ err: error }, "Request validation failed");
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
        details: z.flattenError(error).fieldErrors,
      },
    });
    return;
  }

  req.log.error({ err: error }, "Unhandled error");
  res.status(500).json({
    error: {
      code: "INTERNAL",
      message: "Internal server error",
    },
  });
};
