import { eq } from "drizzle-orm";

import { db } from "../../../db/index.js";
import {
  channelMemberOverwrites,
  channelRoleOverwrites,
} from "../../../db/schema/index.js";

export interface RoleOverwriteEntry {
  roleId: string;
  allow: number;
  deny: number;
}

export interface MemberOverwriteEntry {
  userId: string;
  allow: number;
  deny: number;
}

export interface ChannelOverwrites {
  roles: RoleOverwriteEntry[];
  members: MemberOverwriteEntry[];
}

export async function listChannelOverwrites(
  channelId: string,
): Promise<ChannelOverwrites> {
  const roles = await db
    .select({
      roleId: channelRoleOverwrites.roleId,
      allow: channelRoleOverwrites.allow,
      deny: channelRoleOverwrites.deny,
    })
    .from(channelRoleOverwrites)
    .where(eq(channelRoleOverwrites.channelId, channelId))
    .orderBy(channelRoleOverwrites.roleId);

  const members = await db
    .select({
      userId: channelMemberOverwrites.userId,
      allow: channelMemberOverwrites.allow,
      deny: channelMemberOverwrites.deny,
    })
    .from(channelMemberOverwrites)
    .where(eq(channelMemberOverwrites.channelId, channelId))
    .orderBy(channelMemberOverwrites.userId);

  return { roles, members };
}
