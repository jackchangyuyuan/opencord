import { Permissions } from "@opencord/shared/permissions";
import {
  createServerSchema,
  paginationSchema,
  updateServerSchema,
} from "@opencord/shared/schemas";
import { Router } from "express";
import { z } from "zod";

import { requirePermission } from "../../middleware/permissions.js";
import { validate } from "../../middleware/validate.js";
import { listAuditLog } from "./audit-log.js";
import {
  listServerMembers,
  listServersForUser,
  serializeServerDetail,
} from "./queries.js";
import { createServer, updateServer } from "./service.js";

const serverParamsSchema = z.object({ serverId: z.uuid() });

export const serversRouter = Router();

serversRouter.get("/", async (req, res) => {
  res.json(await listServersForUser(req.user.id));
});

serversRouter.post(
  "/",
  validate({ body: createServerSchema }),
  async (req, res) => {
    res.status(201).json(await createServer(req.user.id, req.body));
  },
);

serversRouter.get(
  "/:serverId",
  validate({ params: serverParamsSchema }),
  requirePermission(Permissions.VIEW_CHANNEL),
  (req, res) => {
    res.json(serializeServerDetail(req.server));
  },
);

serversRouter.get(
  "/:serverId/members",
  validate({ params: serverParamsSchema, query: paginationSchema }),
  requirePermission(Permissions.VIEW_CHANNEL),
  async (req, res) => {
    res.json(await listServerMembers(req.server.server.id, req.query));
  },
);

serversRouter.patch(
  "/:serverId",
  validate({ params: serverParamsSchema, body: updateServerSchema }),
  requirePermission(Permissions.MANAGE_SERVER),
  async (req, res) => {
    res.json(await updateServer(req.server, req.user.id, req.body));
  },
);

serversRouter.get(
  "/:serverId/audit-log",
  validate({ params: serverParamsSchema, query: paginationSchema }),
  requirePermission(Permissions.MANAGE_SERVER),
  async (req, res) => {
    res.json(await listAuditLog(req.server.server.id, req.query));
  },
);
