import { Permissions } from "@opencord/shared/permissions";
import { Router } from "express";
import { z } from "zod";

import { requireChannelPermission } from "../../../middleware/permissions.js";
import { validate } from "../../../middleware/validate.js";
import { addReaction, removeReaction } from "./service.js";

const reactionParamsSchema = z.object({
  channelId: z.uuid(),
  messageId: z.uuid(),
  emoji: z.string().min(1).max(32),
});

export const reactionsRouter = Router({ mergeParams: true });

reactionsRouter.put(
  "/:emoji",
  validate({ params: reactionParamsSchema }),
  requireChannelPermission(Permissions.ADD_REACTIONS),
  async (req, res) => {
    await addReaction(
      req.channel.id,
      req.user.id,
      req.params.messageId,
      req.params.emoji,
    );

    res.status(204).end();
  },
);

reactionsRouter.delete(
  "/:emoji",
  validate({ params: reactionParamsSchema }),
  requireChannelPermission(Permissions.ADD_REACTIONS),
  async (req, res) => {
    await removeReaction(
      req.channel.id,
      req.user.id,
      req.params.messageId,
      req.params.emoji,
    );

    res.status(204).end();
  },
);
