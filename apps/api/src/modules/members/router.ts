import { Permissions } from "@opencord/shared/permissions";
import { paginationSchema } from "@opencord/shared/schemas";
import { Router } from "express";
import { z } from "zod";

import { requirePermission } from "../../middleware/permissions.js";
import { validate } from "../../middleware/validate.js";
import { kickMember } from "../moderation/service.js";
import { listServerMembers } from "../servers/queries.js";
import { leaveServer } from "../servers/service.js";
import { assignRole, unassignRole } from "./service.js";

const serverParamsSchema = z.object({ serverId: z.uuid() });
const memberParamsSchema = z.object({
  serverId: z.uuid(),
  userId: z.string().min(1),
});
const memberRoleParamsSchema = z.object({
  serverId: z.uuid(),
  userId: z.string().min(1),
  roleId: z.uuid(),
});

export const serverMembersRouter = Router({ mergeParams: true });

serverMembersRouter.get(
  "/",
  validate({ params: serverParamsSchema, query: paginationSchema }),
  requirePermission(),
  async (req, res) => {
    res.json(await listServerMembers(req.server.server.id, req.query));
  },
);

serverMembersRouter.delete(
  "/@me",
  validate({ params: serverParamsSchema }),
  requirePermission(),
  async (req, res) => {
    await leaveServer(req.server, req.user.id);
    res.status(204).end();
  },
);

serverMembersRouter.delete(
  "/:userId",
  validate({ params: memberParamsSchema }),
  requirePermission(Permissions.KICK_MEMBERS),
  async (req, res) => {
    await kickMember(req.server, req.user.id, req.params.userId);
    res.status(204).end();
  },
);

serverMembersRouter.put(
  "/:userId/roles/:roleId",
  validate({ params: memberRoleParamsSchema }),
  requirePermission(Permissions.MANAGE_ROLES),
  async (req, res) => {
    res.json({
      roleIds: await assignRole(
        req.server,
        req.user.id,
        req.params.userId,
        req.params.roleId,
      ),
    });
  },
);

serverMembersRouter.delete(
  "/:userId/roles/:roleId",
  validate({ params: memberRoleParamsSchema }),
  requirePermission(Permissions.MANAGE_ROLES),
  async (req, res) => {
    res.json({
      roleIds: await unassignRole(
        req.server,
        req.user.id,
        req.params.userId,
        req.params.roleId,
      ),
    });
  },
);
