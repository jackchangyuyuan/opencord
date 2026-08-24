import { Router } from "express";

import { config } from "../../config.js";
import { countLocalSockets } from "../../socket/emit.js";
import { countOnlineUsers } from "../../socket/presence.js";

export const statsRouter = Router();

statsRouter.get("/", async (_req, res) => {
  res.json({
    instanceId: config.INSTANCE_ID,
    sockets: countLocalSockets(),
    onlineUsers: await countOnlineUsers(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});
