import { Permissions } from "@opencord/shared/permissions";
import {
  auditLogPageSchema,
  createServerSchema,
  updateServerSchema,
} from "@opencord/shared/schemas";
import { Router } from "express";
import { z } from "zod";

import { requireServerPermission } from "../../middleware/permissions.js";
import { createResourceRateLimit } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import { listAuditLog, listAuditPeople } from "./audit-log.js";
import { listServersForUser, serializeServerDetail } from "./queries.js";
import {
  createServer,
  deleteServer,
  transferOwnership,
  updateServer,
} from "./service.js";

const serverParamsSchema = z.object({ serverId: z.uuid() });
const transferOwnershipSchema = z.object({ userId: z.string().min(1) });

export const serversRouter = Router();

serversRouter.get("/", async (req, res) => {
  res.json(await listServersForUser(req.user.id));
});

serversRouter.post(
  "/",
  validate({ body: createServerSchema }),
  createResourceRateLimit,
  async (req, res) => {
    res.status(201).json(await createServer(req.user, req.body));
  },
);

serversRouter.get(
  "/:serverId",
  validate({ params: serverParamsSchema }),
  requireServerPermission(),
  async (req, res) => {
    res.json(await serializeServerDetail(req.server));
  },
);

serversRouter.patch(
  "/:serverId",
  validate({ params: serverParamsSchema, body: updateServerSchema }),
  requireServerPermission(Permissions.MANAGE_SERVER),
  async (req, res) => {
    res.json(await updateServer(req.server, req.user.id, req.body));
  },
);

serversRouter.get(
  "/:serverId/audit-log",
  validate({ params: serverParamsSchema, query: auditLogPageSchema }),
  requireServerPermission(Permissions.MANAGE_SERVER),
  async (req, res) => {
    res.json(await listAuditLog(req.server.server.id, req.query));
  },
);

serversRouter.get(
  "/:serverId/audit-log/people",
  validate({ params: serverParamsSchema }),
  requireServerPermission(Permissions.MANAGE_SERVER),
  async (req, res) => {
    res.json(await listAuditPeople(req.server.server.id));
  },
);

serversRouter.post(
  "/:serverId/owner",
  validate({ params: serverParamsSchema, body: transferOwnershipSchema }),
  requireServerPermission(),
  async (req, res) => {
    res.json(await transferOwnership(req.server, req.user.id, req.body.userId));
  },
);

serversRouter.delete(
  "/:serverId",
  validate({ params: serverParamsSchema }),
  requireServerPermission(),
  async (req, res) => {
    await deleteServer(req.server, req.user.id);
    res.status(204).end();
  },
);
