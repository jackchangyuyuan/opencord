import { Permissions } from "@opencord/shared/permissions";
import {
  createRoleSchema,
  reorderRolesSchema,
  updateRoleSchema,
} from "@opencord/shared/schemas";
import { Router } from "express";
import { z } from "zod";

import { requireServerPermission } from "../../middleware/permissions.js";
import { createResourceRateLimit } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import { listServerRoles } from "./queries.js";
import { createRole, deleteRole, reorderRoles, updateRole } from "./service.js";

const serverParamsSchema = z.object({ serverId: z.uuid() });
const roleParamsSchema = z.object({ serverId: z.uuid(), roleId: z.uuid() });

export const serverRolesRouter = Router({ mergeParams: true });

serverRolesRouter.get(
  "/",
  validate({ params: serverParamsSchema }),
  requireServerPermission(),
  async (req, res) => {
    res.json(await listServerRoles(req.server.server.id));
  },
);

serverRolesRouter.post(
  "/",
  validate({ params: serverParamsSchema, body: createRoleSchema }),
  requireServerPermission(Permissions.MANAGE_ROLES),
  createResourceRateLimit,
  async (req, res) => {
    res.status(201).json(await createRole(req.server, req.body));
  },
);

serverRolesRouter.patch(
  "/positions",
  validate({ params: serverParamsSchema, body: reorderRolesSchema }),
  requireServerPermission(Permissions.MANAGE_ROLES),
  async (req, res) => {
    res.json(await reorderRoles(req.server, req.body));
  },
);

serverRolesRouter.patch(
  "/:roleId",
  validate({ params: roleParamsSchema, body: updateRoleSchema }),
  requireServerPermission(Permissions.MANAGE_ROLES),
  async (req, res) => {
    res.json(await updateRole(req.server, req.params.roleId, req.body));
  },
);

serverRolesRouter.delete(
  "/:roleId",
  validate({ params: roleParamsSchema }),
  requireServerPermission(Permissions.MANAGE_ROLES),
  async (req, res) => {
    await deleteRole(req.server, req.params.roleId);
    res.status(204).end();
  },
);
