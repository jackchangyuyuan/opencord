import { Permissions } from "@opencord/shared/permissions";
import {
  createChannelSchema,
  reorderChannelsSchema,
  updateChannelSchema,
} from "@opencord/shared/schemas";
import { Router } from "express";
import { z } from "zod";

import {
  resolveAccessibleServerChannels,
  resolveChannelsEveryoneCanRead,
} from "../../access/channels.js";
import { config } from "../../config.js";
import { notADirectMessage, notFound } from "../../lib/errors.js";
import { signMediaUrl } from "../../lib/storage.js";
import {
  requireChannelPermission,
  requireServerChannel,
  requireServerPermission,
} from "../../middleware/permissions.js";
import { createResourceRateLimit } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import { listDmParticipants } from "../dms/queries.js";
import { findChannelAttachment } from "../messages/attachments.js";
import { channelPinsRouter } from "../messages/pins/router.js";
import { overwritesRouter } from "./overwrites/router.js";
import { listServerChannels, serializeChannel } from "./queries.js";
import { readRouter } from "./read-state/router.js";
import {
  createChannel,
  deleteChannel,
  reorderChannels,
  updateChannel,
} from "./service.js";

const serverParamsSchema = z.object({ serverId: z.uuid() });
const channelParamsSchema = z.object({ channelId: z.uuid() });
const attachmentParamsSchema = z.object({
  channelId: z.uuid(),
  attachmentId: z.uuid(),
});

export const serverChannelsRouter = Router({ mergeParams: true });

serverChannelsRouter.get(
  "/",
  validate({ params: serverParamsSchema }),
  requireServerPermission(),
  async (req, res) => {
    res.json(
      await listServerChannels(
        req.server.server.id,
        req.user.id,
        await resolveAccessibleServerChannels(
          req.user.id,
          req.server.server.id,
        ),
      ),
    );
  },
);

serverChannelsRouter.post(
  "/",
  validate({ params: serverParamsSchema, body: createChannelSchema }),
  requireServerPermission(Permissions.MANAGE_CHANNELS),
  createResourceRateLimit,
  async (req, res) => {
    res.status(201).json(await createChannel(req.server, req.body));
  },
);

serverChannelsRouter.patch(
  "/positions",
  validate({ params: serverParamsSchema, body: reorderChannelsSchema }),
  requireServerPermission(Permissions.MANAGE_CHANNELS),
  async (req, res) => {
    res.json(await reorderChannels(req.server, req.body));
  },
);

export const channelsRouter = Router();

channelsRouter.use("/:channelId/overwrites", overwritesRouter);
channelsRouter.use("/:channelId/pins", channelPinsRouter);
channelsRouter.use("/:channelId/read", readRouter);

channelsRouter.get(
  "/:channelId",
  validate({ params: channelParamsSchema }),
  requireChannelPermission(),
  (req, res) => {
    res.json(serializeChannel(req.channel.channel));
  },
);

channelsRouter.get(
  "/:channelId/members",
  validate({ params: channelParamsSchema }),
  requireChannelPermission(),
  async (req, res) => {
    if (req.channel.channel.serverId !== null) {
      throw notADirectMessage();
    }

    res.json(await listDmParticipants(req.channel.channel.id));
  },
);

channelsRouter.get(
  "/:channelId/attachments/:attachmentId",
  validate({ params: attachmentParamsSchema }),
  requireChannelPermission(),
  async (req, res) => {
    const channelId = req.channel.channel.id;
    const attachment = await findChannelAttachment(
      channelId,
      req.params.attachmentId,
    );

    if (attachment === undefined) {
      throw notFound("NOT_FOUND", "Attachment not found");
    }

    const cacheable = (await resolveChannelsEveryoneCanRead([channelId])).has(
      channelId,
    );

    res.setHeader(
      "Cache-Control",
      cacheable
        ? `private, max-age=${String(config.MEDIA_URL_SIGNING_BUCKET)}`
        : "private, no-store",
    );

    res.redirect(
      302,
      await signMediaUrl(
        attachment.objectKey,
        cacheable ? "cacheable" : "no-store",
      ),
    );
  },
);

channelsRouter.patch(
  "/:channelId",
  validate({ params: channelParamsSchema, body: updateChannelSchema }),
  requireServerChannel(Permissions.MANAGE_CHANNELS),
  async (req, res) => {
    res.json(await updateChannel(req.server, req.channel.channel, req.body));
  },
);

channelsRouter.delete(
  "/:channelId",
  validate({ params: channelParamsSchema }),
  requireServerChannel(Permissions.MANAGE_CHANNELS),
  async (req, res) => {
    await deleteChannel(req.server, req.channel.channel);
    res.status(204).end();
  },
);
