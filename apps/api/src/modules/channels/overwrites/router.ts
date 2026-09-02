import { Permissions } from "@opencord/shared/permissions";
import { overwriteSchema } from "@opencord/shared/schemas";
import { Router } from "express";
import { z } from "zod";

import { requireServerChannel } from "../../../middleware/permissions.js";
import { validate } from "../../../middleware/validate.js";
import { listChannelOverwrites } from "./queries.js";
import {
  deleteMemberOverwrite,
  deleteRoleOverwrite,
  putMemberOverwrite,
  putRoleOverwrite,
} from "./service.js";

const channelParamsSchema = z.object({ channelId: z.uuid() });
const roleParamsSchema = z.object({
  channelId: z.uuid(),
  roleId: z.uuid(),
});
const memberParamsSchema = z.object({
  channelId: z.uuid(),
  userId: z.string().min(1),
});

export const overwritesRouter = Router({ mergeParams: true });

overwritesRouter.get(
  "/",
  validate({ params: channelParamsSchema }),
  requireServerChannel(),
  async (req, res) => {
    res.json(await listChannelOverwrites(req.channel.channel.id));
  },
);

overwritesRouter.put(
  "/roles/:roleId",
  validate({ params: roleParamsSchema, body: overwriteSchema }),
  requireServerChannel(Permissions.MANAGE_ROLES),
  async (req, res) => {
    res.json(
      await putRoleOverwrite(
        req.server,
        req.channel.channel,
        req.user.id,
        req.params.roleId,
        req.body,
      ),
    );
  },
);

overwritesRouter.delete(
  "/roles/:roleId",
  validate({ params: roleParamsSchema }),
  requireServerChannel(Permissions.MANAGE_ROLES),
  async (req, res) => {
    await deleteRoleOverwrite(
      req.server,
      req.channel.channel,
      req.user.id,
      req.params.roleId,
    );
    res.status(204).end();
  },
);

overwritesRouter.put(
  "/members/:userId",
  validate({ params: memberParamsSchema, body: overwriteSchema }),
  requireServerChannel(Permissions.MANAGE_ROLES),
  async (req, res) => {
    res.json(
      await putMemberOverwrite(
        req.server,
        req.channel.channel,
        req.user.id,
        req.params.userId,
        req.body,
      ),
    );
  },
);

overwritesRouter.delete(
  "/members/:userId",
  validate({ params: memberParamsSchema }),
  requireServerChannel(Permissions.MANAGE_ROLES),
  async (req, res) => {
    await deleteMemberOverwrite(
      req.server,
      req.channel.channel,
      req.user.id,
      req.params.userId,
    );
    res.status(204).end();
  },
);
