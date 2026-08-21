import { Permissions } from "@opencord/shared/permissions";
import { sendMessageSchema } from "@opencord/shared/schemas";
import { Router } from "express";
import { z } from "zod";

import { requireChannelPermission } from "../../middleware/permissions.js";
import { validate } from "../../middleware/validate.js";
import { serializeMessage } from "./queries.js";
import { sendMessage } from "./service.js";

const channelParamsSchema = z.object({ channelId: z.uuid() });

export const messagesRouter = Router({ mergeParams: true });

messagesRouter.post(
  "/",
  validate({ params: channelParamsSchema, body: sendMessageSchema }),
  requireChannelPermission(Permissions.SEND_MESSAGES),
  async (req, res) => {
    const result = await sendMessage(req.channel, req.user.id, req.body);

    res.status(result.created ? 201 : 200).json(serializeMessage(result.row));
  },
);
