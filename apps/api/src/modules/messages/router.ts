import { Permissions } from "@opencord/shared/permissions";
import {
  editMessageSchema,
  messagePageSchema,
  sendMessageSchema,
} from "@opencord/shared/schemas";
import { Router } from "express";
import { z } from "zod";

import { requireChannelPermission } from "../../middleware/permissions.js";
import { sendMessageRateLimit } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import { listChannelMessages } from "./queries.js";
import { reactionsRouter } from "./reactions/router.js";
import { serializeMessages } from "./serialize.js";
import { deleteMessage, editMessage, sendMessage } from "./service.js";

const channelParamsSchema = z.object({ channelId: z.uuid() });
const messageParamsSchema = z.object({
  channelId: z.uuid(),
  messageId: z.uuid(),
});

export const messagesRouter = Router({ mergeParams: true });

messagesRouter.use("/:messageId/reactions", reactionsRouter);

messagesRouter.post(
  "/",
  validate({ params: channelParamsSchema, body: sendMessageSchema }),
  requireChannelPermission(Permissions.SEND_MESSAGES),
  sendMessageRateLimit,
  async (req, res) => {
    const result = await sendMessage(
      req.server,
      req.channel,
      req.user.id,
      req.body,
    );

    res.status(result.created ? 201 : 200).json(result.message);
  },
);

messagesRouter.get(
  "/",
  validate({ params: channelParamsSchema, query: messagePageSchema }),
  requireChannelPermission(),
  async (req, res) => {
    const page = await listChannelMessages(req.channel.id, req.query);

    res.json({
      data: await serializeMessages(page.rows, req.user.id),
      nextCursor: page.nextCursor,
    });
  },
);

messagesRouter.patch(
  "/:messageId",
  validate({ params: messageParamsSchema, body: editMessageSchema }),
  requireChannelPermission(),
  async (req, res) => {
    res.json(
      await editMessage(
        req.server,
        req.channel,
        req.user.id,
        req.params.messageId,
        req.body,
      ),
    );
  },
);

messagesRouter.delete(
  "/:messageId",
  validate({ params: messageParamsSchema }),
  requireChannelPermission(),
  async (req, res) => {
    res.json(
      await deleteMessage(
        req.server,
        req.channel,
        req.user.id,
        req.params.messageId,
      ),
    );
  },
);
