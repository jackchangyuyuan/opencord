import { Permissions } from "@opencord/shared/permissions";
import { memberPageSchema } from "@opencord/shared/schemas";
import { Router } from "express";
import { z } from "zod";

import { notFound } from "../../lib/errors.js";
import { requireServerPermission } from "../../middleware/permissions.js";
import { validate } from "../../middleware/validate.js";
import { kickMember } from "../moderation/service.js";
import { findServerMember, listServerMembers } from "../servers/queries.js";
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
  validate({ params: serverParamsSchema, query: memberPageSchema }),
  requireServerPermission(),
  async (req, res) => {
    res.json(await listServerMembers(req.server.server.id, req.query));
  },
);

serverMembersRouter.get(
  "/:userId",
  validate({ params: memberParamsSchema }),
  requireServerPermission(),
  async (req, res) => {
    const member = await findServerMember(
      req.server.server.id,
      req.params.userId,
    );

    if (member === undefined) {
      throw notFound("MEMBER_NOT_FOUND", "That person is not in this server");
    }

    res.json(member);
  },
);

serverMembersRouter.delete(
  "/@me",
  validate({ params: serverParamsSchema }),
  requireServerPermission(),
  async (req, res) => {
    await leaveServer(req.server, req.user.id);
    res.status(204).end();
  },
);

serverMembersRouter.delete(
  "/:userId",
  validate({ params: memberParamsSchema }),
  requireServerPermission(Permissions.KICK_MEMBERS),
  async (req, res) => {
    await kickMember(req.server, req.user.id, req.params.userId);
    res.status(204).end();
  },
);

serverMembersRouter.put(
  "/:userId/roles/:roleId",
  validate({ params: memberRoleParamsSchema }),
  requireServerPermission(Permissions.MANAGE_ROLES),
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
  requireServerPermission(Permissions.MANAGE_ROLES),
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
