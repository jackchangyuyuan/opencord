import { toNodeHandler } from "better-auth/node";
import { sql } from "drizzle-orm";
import express from "express";

import { auth } from "./auth.js";
import { config } from "./config.js";
import { db } from "./db/index.js";
import { notFound } from "./lib/errors.js";
import { requireAuth, revokeSignedOutSession } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.js";
import { httpLogger } from "./middleware/http-logger.js";
import { authRateLimit, searchRateLimit } from "./middleware/rate-limit.js";
import {
  channelsRouter,
  serverChannelsRouter,
} from "./modules/channels/router.js";
import { demoRouter } from "./modules/demo/router.js";
import { dmsRouter } from "./modules/dms/router.js";
import {
  invitesRouter,
  serverInvitesRouter,
} from "./modules/invites/router.js";
import { serverMembersRouter } from "./modules/members/router.js";
import { messagesRouter } from "./modules/messages/router.js";
import { serverBansRouter } from "./modules/moderation/router.js";
import { serverRolesRouter } from "./modules/roles/router.js";
import { searchRouter } from "./modules/search/router.js";
import { serversRouter } from "./modules/servers/router.js";
import { statsRouter } from "./modules/stats/router.js";
import { uploadsRouter } from "./modules/uploads/router.js";
import { usersRouter } from "./modules/users/router.js";
import { redis } from "./redis.js";

export const app = express();

app.set("trust proxy", config.TRUST_PROXY_HOPS);

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

app.all(
  "/api/auth/*splat",
  authRateLimit,
  revokeSignedOutSession,
  toNodeHandler(auth),
);

app.use("/api/v1/demo", demoRouter);

const apiRouter = express.Router();

apiRouter.use(requireAuth);
apiRouter.use(express.json());
apiRouter.use("/channels", channelsRouter);
apiRouter.use("/channels/:channelId/messages", messagesRouter);
apiRouter.use("/dms", dmsRouter);
apiRouter.use("/invites", invitesRouter);
apiRouter.use("/search", searchRateLimit, searchRouter);
apiRouter.use("/servers", serversRouter);
apiRouter.use("/servers/:serverId/channels", serverChannelsRouter);
apiRouter.use("/servers/:serverId/invites", serverInvitesRouter);
apiRouter.use("/servers/:serverId/bans", serverBansRouter);
apiRouter.use("/servers/:serverId/members", serverMembersRouter);
apiRouter.use("/servers/:serverId/roles", serverRolesRouter);
apiRouter.use("/stats", statsRouter);
apiRouter.use("/uploads", uploadsRouter);
apiRouter.use("/users", usersRouter);

app.use("/api/v1", apiRouter);

app.use((_req, _res, next) => {
  next(notFound());
});

app.use(errorHandler);
