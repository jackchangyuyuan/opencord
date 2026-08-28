import { Router } from "express";
import { z } from "zod";

import { requireChannelPermission } from "../../../middleware/permissions.js";
import { validate } from "../../../middleware/validate.js";
import { markRead } from "./service.js";

const channelParamsSchema = z.object({ channelId: z.uuid() });
const markReadSchema = z.object({ messageId: z.uuid() });

export const readRouter = Router({ mergeParams: true });

readRouter.put(
  "/",
  validate({ params: channelParamsSchema, body: markReadSchema }),
  requireChannelPermission(),
  async (req, res) => {
    res.json(await markRead(req.user.id, req.channel.id, req.body.messageId));
  },
);
