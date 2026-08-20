import {
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { channels } from "./channels.js";
import { roles } from "./roles.js";
import { serverMembers } from "./servers.js";

export const channelRoleOverwrites = pgTable(
  "channel_role_overwrites",
  {
    channelId: uuid("channel_id").notNull(),
    serverId: uuid("server_id").notNull(),
    roleId: uuid("role_id").notNull(),
    allow: integer("allow").default(0).notNull(),
    deny: integer("deny").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "channel_role_overwrites_pkey",
      columns: [table.channelId, table.roleId],
    }),
    foreignKey({
      name: "channel_role_overwrites_channel_id_server_id_fkey",
      columns: [table.channelId, table.serverId],
      foreignColumns: [channels.id, channels.serverId],
    }).onDelete("cascade"),
    foreignKey({
      name: "channel_role_overwrites_role_id_server_id_fkey",
      columns: [table.roleId, table.serverId],
      foreignColumns: [roles.id, roles.serverId],
    }).onDelete("cascade"),
  ],
);

export const channelMemberOverwrites = pgTable(
  "channel_member_overwrites",
  {
    channelId: uuid("channel_id").notNull(),
    serverId: uuid("server_id").notNull(),
    userId: text("user_id").notNull(),
    allow: integer("allow").default(0).notNull(),
    deny: integer("deny").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "channel_member_overwrites_pkey",
      columns: [table.channelId, table.userId],
    }),
    foreignKey({
      name: "channel_member_overwrites_channel_id_server_id_fkey",
      columns: [table.channelId, table.serverId],
      foreignColumns: [channels.id, channels.serverId],
    }).onDelete("cascade"),
    foreignKey({
      name: "channel_member_overwrites_server_id_user_id_fkey",
      columns: [table.serverId, table.userId],
      foreignColumns: [serverMembers.serverId, serverMembers.userId],
    }).onDelete("cascade"),
  ],
);
