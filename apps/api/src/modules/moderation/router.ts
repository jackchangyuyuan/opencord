import { Permissions } from "@opencord/shared/permissions";
import { Router } from "express";
import { z } from "zod";

import { requirePermission } from "../../middleware/permissions.js";
import { validate } from "../../middleware/validate.js";
import { listBans } from "./queries.js";
import { banMember, unbanMember } from "./service.js";

const serverParamsSchema = z.object({ serverId: z.uuid() });
const targetParamsSchema = z.object({
  serverId: z.uuid(),
  userId: z.string().min(1),
});

const banBodySchema = z.object({
  reason: z.string().trim().max(512).optional(),
});

export const serverBansRouter = Router({ mergeParams: true });

serverBansRouter.get(
  "/",
  validate({ params: serverParamsSchema }),
  requirePermission(Permissions.BAN_MEMBERS),
  async (req, res) => {
    res.json(await listBans(req.server.server.id));
  },
);

serverBansRouter.put(
  "/:userId",
  validate({ params: targetParamsSchema, body: banBodySchema }),
  requirePermission(Permissions.BAN_MEMBERS),
  async (req, res) => {
    await banMember(
      req.server,
      req.user.id,
      req.params.userId,
      req.body.reason ?? null,
    );

    res.status(204).end();
  },
);

serverBansRouter.delete(
  "/:userId",
  validate({ params: targetParamsSchema }),
  requirePermission(Permissions.BAN_MEMBERS),
  async (req, res) => {
    await unbanMember(req.server, req.user.id, req.params.userId);
    res.status(204).end();
  },
);
