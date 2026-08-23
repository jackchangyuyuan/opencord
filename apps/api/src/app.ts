import { toNodeHandler } from "better-auth/node";
import { sql } from "drizzle-orm";
import express from "express";

import { auth } from "./auth.js";
import { db } from "./db/index.js";
import { notFound } from "./lib/errors.js";
import { requireAuth, revokeSignedOutSession } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.js";
import { httpLogger } from "./middleware/http-logger.js";
import {
  channelsRouter,
  serverChannelsRouter,
} from "./modules/channels/router.js";
import { serverMembersRouter } from "./modules/members/router.js";
import { messagesRouter } from "./modules/messages/router.js";
import { serverRolesRouter } from "./modules/roles/router.js";
import { serversRouter } from "./modules/servers/router.js";
import { usersRouter } from "./modules/users/router.js";
import { redis } from "./redis.js";

export const app = express();

app.use(httpLogger);

app.get("/livez", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/readyz", async (req, res) => {
  const probe = async (
    dependency: string,
    ping: () => Promise<unknown>,
  ): Promise<"ok" | "error"> => {
    try {
      await ping();
      return "ok";
    } catch (error) {
      req.log.error({ err: error, dependency }, "Readiness check failed");
      return "error";
    }
  };

  const [postgres, redisStatus] = await Promise.all([
    probe("postgres", () => db.execute(sql`select 1`)),
    probe("redis", () => redis.ping()),
  ]);

  const status = { postgres, redis: redisStatus };

  const ready = Object.values(status).every((value) => value === "ok");

  res.status(ready ? 200 : 503).json(status);
});

app.all("/api/auth/*splat", revokeSignedOutSession, toNodeHandler(auth));

const apiRouter = express.Router();

apiRouter.use(requireAuth);
apiRouter.use(express.json());
apiRouter.use("/channels", channelsRouter);
apiRouter.use("/channels/:channelId/messages", messagesRouter);
apiRouter.use("/servers", serversRouter);
apiRouter.use("/servers/:serverId/channels", serverChannelsRouter);
apiRouter.use("/servers/:serverId/members", serverMembersRouter);
apiRouter.use("/servers/:serverId/roles", serverRolesRouter);
apiRouter.use("/users", usersRouter);

app.use("/api/v1", apiRouter);

app.use((_req, _res, next) => {
  next(notFound());
});

app.use(errorHandler);
