import { pino } from "pino";

import { config } from "../config.js";

export const REDACTED = "redacted";

export const REDACT = {
  paths: [
    "req.headers.cookie",
    "req.headers.authorization",
    'res.headers["set-cookie"]',
  ],
  censor: REDACTED,
};

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: REDACT,
  ...(config.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty" } }
    : {}),
});
