import { Permissions } from "@opencord/shared/permissions";
import {
  createChannelSchema,
  updateChannelSchema,
} from "@opencord/shared/schemas";
import { Router } from "express";
import { z } from "zod";

import {
  requireChannelPermission,
  requirePermission,
} from "../../middleware/permissions.js";
import { validate } from "../../middleware/validate.js";
import { overwritesRouter } from "./overwrites/router.js";
import { listServerChannels, serializeChannel } from "./queries.js";
import { createChannel, deleteChannel, updateChannel } from "./service.js";

const serverParamsSchema = z.object({ serverId: z.uuid() });
const channelParamsSchema = z.object({ channelId: z.uuid() });

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

export const channelsRouter = Router();

channelsRouter.use("/:channelId/overwrites", overwritesRouter);

channelsRouter.get(
  "/:channelId",
  validate({ params: channelParamsSchema }),
  requireChannelPermission(Permissions.VIEW_CHANNEL),
  (req, res) => {
    res.json(serializeChannel(req.channel));
  },
);

channelsRouter.patch(
  "/:channelId",
  validate({ params: channelParamsSchema, body: updateChannelSchema }),
  requireChannelPermission(Permissions.MANAGE_CHANNELS),
  async (req, res) => {
    res.json(
      await updateChannel(req.server, req.channel, req.user.id, req.body),
    );
  },
);

channelsRouter.delete(
  "/:channelId",
  validate({ params: channelParamsSchema }),
  requireChannelPermission(Permissions.MANAGE_CHANNELS),
  async (req, res) => {
    await deleteChannel(req.server, req.channel, req.user.id);
    res.status(204).end();
  },
);
