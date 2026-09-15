import { Permissions } from "@opencord/shared/permissions";
import { Router } from "express";
import { z } from "zod";

import { requireChannelPermission } from "../../../middleware/permissions.js";
import { validate } from "../../../middleware/validate.js";
import { listPins, pinMessage, unpinMessage } from "./service.js";

const channelParamsSchema = z.object({ channelId: z.uuid() });
const messageParamsSchema = z.object({
  channelId: z.uuid(),
  messageId: z.uuid(),
});

export const channelPinsRouter = Router({ mergeParams: true });

channelPinsRouter.get(
  "/",
  validate({ params: channelParamsSchema }),
  requireChannelPermission(),
  async (req, res) => {
    res.json(await listPins(req.channel.channel.id, req.user.id));
  },
);

export const messagePinRouter = Router({ mergeParams: true });

messagePinRouter.put(
  "/",
  validate({ params: messageParamsSchema }),
  requireChannelPermission(Permissions.MANAGE_MESSAGES),
  async (req, res) => {
    res.json(await pinMessage(req.channel, req.user.id, req.params.messageId));
  },
);

messagePinRouter.delete(
  "/",
  validate({ params: messageParamsSchema }),
  requireChannelPermission(Permissions.MANAGE_MESSAGES),
  async (req, res) => {
    res.json(
      await unpinMessage(req.channel, req.user.id, req.params.messageId),
    );
  },
);
