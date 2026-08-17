import { Redis } from "ioredis";

import { config } from "./config.js";
import { logger } from "./lib/logger.js";

export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

redis.on("error", (error: Error) => {
  logger.error({ err: error }, "Redis connection failed");
});
