import { Permissions } from "@opencord/shared/permissions";
import { createInviteSchema, inviteCodeSchema } from "@opencord/shared/schemas";
import { Router } from "express";
import { z } from "zod";

import { requireServerPermission } from "../../middleware/permissions.js";
import { redeemInviteRateLimit } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import { listServerInvites } from "./queries.js";
import { createInvite, previewInvite, redeemInvite } from "./service.js";

const serverParamsSchema = z.object({ serverId: z.uuid() });
const codeParamsSchema = z.object({ code: inviteCodeSchema });

export const serverInvitesRouter = Router({ mergeParams: true });

serverInvitesRouter.get(
  "/",
  validate({ params: serverParamsSchema }),
  requireServerPermission(Permissions.CREATE_INVITE),
  async (req, res) => {
    res.json(await listServerInvites(req.server.server.id));
  },
);

serverInvitesRouter.post(
  "/",
  validate({ params: serverParamsSchema, body: createInviteSchema }),
  requireServerPermission(Permissions.CREATE_INVITE),
  async (req, res) => {
    res.status(201).json(await createInvite(req.server, req.user.id, req.body));
  },
);

export const invitesRouter = Router();

invitesRouter.post(
  "/:code",
  validate({ params: codeParamsSchema }),
  redeemInviteRateLimit,
  async (req, res) => {
    res.json(await redeemInvite(req.params.code, req.user.id));
  },
);

invitesRouter.get(
  "/:code",
  validate({ params: codeParamsSchema }),
  async (req, res) => {
    res.json(await previewInvite(req.params.code));
  },
);
