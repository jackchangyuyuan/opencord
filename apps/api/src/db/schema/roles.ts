import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { serverMembers, servers } from "./servers.js";

export const roles = pgTable(
  "roles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: integer("color"),
    permissions: integer("permissions").default(0).notNull(),
    position: integer("position").default(0).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("roles_server_id_idx").on(table.serverId),
    unique("roles_id_server_id_uq").on(table.id, table.serverId),
    uniqueIndex("roles_server_id_is_default_uidx")
      .on(table.serverId)
      .where(sql`${table.isDefault}`),
  ],
);

export const memberRoles = pgTable(
  "member_roles",
  {
    serverId: uuid("server_id").notNull(),
    userId: text("user_id").notNull(),
    roleId: uuid("role_id").notNull(),
  },
  (table) => [
    primaryKey({
      name: "member_roles_pkey",
      columns: [table.serverId, table.userId, table.roleId],
    }),
    foreignKey({
      name: "member_roles_server_id_user_id_fkey",
      columns: [table.serverId, table.userId],
      foreignColumns: [serverMembers.serverId, serverMembers.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "member_roles_role_id_server_id_fkey",
      columns: [table.roleId, table.serverId],
      foreignColumns: [roles.id, roles.serverId],
    }).onDelete("cascade"),
    index("member_roles_role_id_idx").on(table.roleId),
  ],
);

export type RoleRow = typeof roles.$inferSelect;
