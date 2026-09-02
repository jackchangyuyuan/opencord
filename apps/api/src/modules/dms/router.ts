import { Router } from "express";
import { z } from "zod";

import { validate } from "../../middleware/validate.js";
import { serializeChannel } from "../channels/queries.js";
import { listDms, loadDmChannel } from "./queries.js";
import { openDm } from "./service.js";

const openDmSchema = z.object({ recipientId: z.string().min(1).max(255) });

export const dmsRouter = Router();

dmsRouter.get("/", async (req, res) => {
  res.json(await listDms(req.user.id));
});

dmsRouter.post("/", validate({ body: openDmSchema }), async (req, res) => {
  const result = await openDm(req.user.id, req.body.recipientId);
  const channel = serializeChannel(await loadDmChannel(result.channelId));

  res.status(result.created ? 201 : 200).json(channel);
});
