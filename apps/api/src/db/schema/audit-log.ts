import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { servers } from "./servers.js";

export const auditAction = pgEnum("audit_action", [
  "member_kick",
  "member_ban",
  "member_unban",
  "invite_create",
  "invite_redeem",
  "role_create",
  "role_update",
  "role_delete",
  "role_assign",
  "role_unassign",
  "overwrite_update",
  "overwrite_delete",
  "channel_create",
  "channel_update",
  "channel_delete",
  "server_update",
  "server_transfer",
  "message_delete",
  "message_pin",
  "message_unpin",
]);

export type AuditAction = (typeof auditAction.enumValues)[number];

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    action: auditAction("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_log_server_id_id_idx").on(table.serverId, table.id.desc()),
  ],
);
