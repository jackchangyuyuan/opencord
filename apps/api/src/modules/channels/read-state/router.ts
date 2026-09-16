import { Router } from "express";
import { z } from "zod";

import { requireChannelPermission } from "../../../middleware/permissions.js";
import { validate } from "../../../middleware/validate.js";
import { serializeChannel } from "../queries.js";
import { markRead } from "./service.js";
import { loadUnreadStates, NOTHING_UNREAD } from "./unread.js";

const channelParamsSchema = z.object({ channelId: z.uuid() });
const markReadSchema = z.object({ messageId: z.uuid() });

export const readRouter = Router({ mergeParams: true });

readRouter.get(
  "/",
  validate({ params: channelParamsSchema }),
  requireChannelPermission(),
  async (req, res) => {
    const channel = req.channel.channel;
    const unread = await loadUnreadStates(req.user.id, [channel.id]);

    res.json({
      ...serializeChannel(channel),
      ...(unread.get(channel.id) ?? NOTHING_UNREAD),
    });
  },
);

readRouter.put(
  "/",
  validate({ params: channelParamsSchema, body: markReadSchema }),
  requireChannelPermission(),
  async (req, res) => {
    res.json(
      await markRead(req.user.id, req.channel.channel.id, req.body.messageId),
    );
  },
);
