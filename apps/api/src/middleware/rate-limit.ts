import type { Request, RequestHandler } from "express";
import { RateLimiterRedis } from "rate-limiter-flexible";

import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { redis } from "../redis.js";

export const AUTH_WINDOW_SECONDS = 60;
export const MESSAGE_WINDOW_SECONDS = 5;
export const CREATE_WINDOW_SECONDS = 60;

export interface Bucket {
  name: string;
  points: number;
  duration: number;
}

type AnyRequest = Request<unknown, unknown, unknown, unknown>;

export function rateLimit(
  bucket: Bucket,
  key: (req: AnyRequest) => string,
): RequestHandler<unknown, unknown, unknown, unknown> {
  const limiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: `${config.RATE_LIMIT_NAMESPACE}:${bucket.name}`,
    points: bucket.points,
    duration: bucket.duration,
  });

  return async (req, res, next) => {
    try {
      await limiter.consume(key(req));
    } catch (rejection) {
      if (rejection instanceof Error) {
        throw rejection;
      }

      res.setHeader("retry-after", Math.ceil(bucket.duration));

      next(
        new AppError(429, "RATE_LIMITED", "Too many requests, slow down", {
          bucket: bucket.name,
        }),
      );
      return;
    }

    next();
  };
}

export const authRateLimit = rateLimit(
  {
    name: "auth",
    points: config.RATE_LIMIT_AUTH_POINTS,
    duration: AUTH_WINDOW_SECONDS,
  },
  (req) => req.ip ?? "unknown",
);

export const createResourceRateLimit = rateLimit(
  {
    name: "create",
    points: config.RATE_LIMIT_CREATE_POINTS,
    duration: CREATE_WINDOW_SECONDS,
  },
  (req) => req.user.id,
);

export const sendMessageRateLimit = rateLimit(
  {
    name: "message",
    points: config.RATE_LIMIT_MESSAGE_POINTS,
    duration: MESSAGE_WINDOW_SECONDS,
  },
  (req) => req.user.id,
);
