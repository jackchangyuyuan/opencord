import { Permissions } from "@opencord/shared/permissions";
import { createChannelSchema } from "@opencord/shared/schemas";
import { Router } from "express";
import { z } from "zod";

import { requirePermission } from "../../middleware/permissions.js";
import { validate } from "../../middleware/validate.js";
import { listServerChannels } from "./queries.js";
import { createChannel } from "./service.js";

const serverParamsSchema = z.object({ serverId: z.uuid() });

export const serverChannelsRouter = Router({ mergeParams: true });

serverChannelsRouter.get(
  "/",
  validate({ params: serverParamsSchema }),
  requirePermission(Permissions.VIEW_CHANNEL),
  async (req, res) => {
    res.json(await listServerChannels(req.server.server.id));
  },
);

serverChannelsRouter.post(
  "/",
  validate({ params: serverParamsSchema, body: createChannelSchema }),
  requirePermission(Permissions.MANAGE_CHANNELS),
  async (req, res) => {
    res
      .status(201)
      .json(await createChannel(req.server, req.user.id, req.body));
  },
);
