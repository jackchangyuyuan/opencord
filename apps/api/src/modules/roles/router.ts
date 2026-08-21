import { Permissions } from "@opencord/shared/permissions";
import { createRoleSchema, updateRoleSchema } from "@opencord/shared/schemas";
import { Router } from "express";
import { z } from "zod";

import { requirePermission } from "../../middleware/permissions.js";
import { validate } from "../../middleware/validate.js";
import { listServerRoles } from "./queries.js";
import { createRole, deleteRole, updateRole } from "./service.js";

const serverParamsSchema = z.object({ serverId: z.uuid() });
const roleParamsSchema = z.object({ serverId: z.uuid(), roleId: z.uuid() });

export const serverRolesRouter = Router({ mergeParams: true });

serverRolesRouter.get(
  "/",
  validate({ params: serverParamsSchema }),
  requirePermission(),
  async (req, res) => {
    res.json(await listServerRoles(req.server.server.id));
  },
);

serverRolesRouter.post(
  "/",
  validate({ params: serverParamsSchema, body: createRoleSchema }),
  requirePermission(Permissions.MANAGE_ROLES),
  async (req, res) => {
    res.status(201).json(await createRole(req.server, req.user.id, req.body));
  },
);

serverRolesRouter.patch(
  "/:roleId",
  validate({ params: roleParamsSchema, body: updateRoleSchema }),
  requirePermission(Permissions.MANAGE_ROLES),
  async (req, res) => {
    res.json(
      await updateRole(req.server, req.user.id, req.params.roleId, req.body),
    );
  },
);

serverRolesRouter.delete(
  "/:roleId",
  validate({ params: roleParamsSchema }),
  requirePermission(Permissions.MANAGE_ROLES),
  async (req, res) => {
    await deleteRole(req.server, req.user.id, req.params.roleId);
    res.status(204).end();
  },
);
