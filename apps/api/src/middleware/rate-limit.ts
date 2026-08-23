import type { Request, RequestHandler } from "express";
import { RateLimiterRedis, type RateLimiterRes } from "rate-limiter-flexible";

import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { redis } from "../redis.js";

export const AUTH_WINDOW_SECONDS = 60;
export const MESSAGE_WINDOW_SECONDS = 5;
export const CREATE_WINDOW_SECONDS = 60;
export const HEARTBEAT_WINDOW_SECONDS = 10;
export const SOCKET_ABUSE_FACTOR = 10;

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

export type SocketVerdict = "allowed" | "limited" | "abusive";

export interface SocketLimiter {
  consume(key: string): Promise<SocketVerdict>;
}

export function socketRateLimit(bucket: Bucket): SocketLimiter {
  const limiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: `${config.RATE_LIMIT_NAMESPACE}:${bucket.name}`,
    points: bucket.points,
    duration: bucket.duration,
  });

  return {
    async consume(key) {
      try {
        await limiter.consume(key);
      } catch (rejection) {
        if (rejection instanceof Error) {
          throw rejection;
        }

        const { consumedPoints } = rejection as RateLimiterRes;

        return consumedPoints > bucket.points * SOCKET_ABUSE_FACTOR
          ? "abusive"
          : "limited";
      }

      return "allowed";
    },
  };
}

export const heartbeatLimiter = socketRateLimit({
  name: "heartbeat",
  points: config.RATE_LIMIT_HEARTBEAT_POINTS,
  duration: HEARTBEAT_WINDOW_SECONDS,
});
