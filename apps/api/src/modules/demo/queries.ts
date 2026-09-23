import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type { Transaction } from "../../db/index.js";
import { db } from "../../db/index.js";
import {
  channelRoleOverwrites,
  channels,
  memberRoles,
  messages,
  readStates,
  roles,
  serverMembers,
  servers,
} from "../../db/schema/index.js";

export async function findCommunityServerIds(): Promise<string[]> {
  const rows = await db
    .select({ id: servers.id })
    .from(servers)
    .where(eq(servers.demoRole, "community"))
    .orderBy(servers.id);

  return rows.map((row) => row.id);
}

export async function findSandboxTemplateId(): Promise<string | undefined> {
  const row = await db.query.servers.findFirst({
    columns: { id: true },
    where: { demoRole: "template" },
  });

  return row?.id;
}

export interface CommunityShape {
  serverId: string;
  name: string | null;
  channelIds: string[];
  channelNames: (string | null)[];
}

export async function loadCommunityShape(
  serverId: string,
): Promise<CommunityShape> {
  const channelRows = await db
    .select({ id: channels.id, name: channels.name })
    .from(channels)
    .where(eq(channels.serverId, serverId))
    .orderBy(channels.position, channels.id);

  const server = await db.query.servers.findFirst({
    columns: { name: true },
    where: { id: serverId },
  });

  return {
    serverId,
    name: server?.name ?? null,
    channelIds: channelRows.map((row) => row.id),
    channelNames: channelRows.map((row) => row.name),
  };
}

export const UNREAD_TAIL = 12;

// A visitor arrives with some channels read and some not. The depth is per
// channel rather than uniform, so the sidebar shows a spread of badge sizes and
// the unread divider lands in a different place in each one -- a single depth
// everywhere makes every channel look identically stale.
export async function placeReadStates(
  tx: Transaction,
  userId: string,
  channelIds: readonly string[],
  depths: readonly number[] = [],
): Promise<void> {
  for (const [index, channelId] of channelIds.entries()) {
    const depth = depths[index] ?? UNREAD_TAIL;

    if (depth <= 0) {
      // Read to the end: the newest message is the watermark.
      const [newest] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(eq(messages.channelId, channelId), isNull(messages.deletedAt)),
        )
        .orderBy(desc(messages.id))
        .limit(1);

      if (newest !== undefined) {
        await tx
          .insert(readStates)
          .values({ userId, channelId, lastReadMessageId: newest.id })
          .onConflictDoNothing();
      }

      continue;
    }

    const tail = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.channelId, channelId), isNull(messages.deletedAt)))
      .orderBy(desc(messages.id))
      .limit(depth + 1);

    const watermark = tail.at(-1);

    if (watermark === undefined || tail.length < 2) {
      continue;
    }

    await tx
      .insert(readStates)
      .values({ userId, channelId, lastReadMessageId: watermark.id })
      .onConflictDoNothing();
  }
}

export interface ClonedSandbox {
  serverId: string;
  channelIds: string[];
}

export async function cloneSandbox(
  tx: Transaction,
  templateId: string,
  ownerId: string,
): Promise<ClonedSandbox> {
  const [server] = await tx
    .insert(servers)
    .values({ name: "Your sandbox", ownerId, isDemoSandbox: true })
    .returning({ id: servers.id });

  if (server === undefined) {
    throw new Error("cloning the sandbox produced no server");
  }

  const templateRoles = await tx
    .select()
    .from(roles)
    .where(eq(roles.serverId, templateId))
    .orderBy(roles.position);

  const roleIds = new Map<string, string>();

  for (const role of templateRoles) {
    const [cloned] = await tx
      .insert(roles)
      .values({
        serverId: server.id,
        name: role.name,
        color: role.color,
        permissions: role.permissions,
        position: role.position,
        isDefault: role.isDefault,
      })
      .returning({ id: roles.id });

    if (cloned === undefined) {
      throw new Error("cloning a sandbox role produced no row");
    }

    roleIds.set(role.id, cloned.id);
  }

  const templateChannels = await tx
    .select()
    .from(channels)
    .where(eq(channels.serverId, templateId))
    .orderBy(channels.position, channels.id);

  const channelIds = new Map<string, string>();

  for (const channel of templateChannels) {
    const [cloned] = await tx
      .insert(channels)
      .values({
        serverId: server.id,
        type: channel.type,
        name: channel.name,
        topic: channel.topic,
        position: channel.position,
      })
      .returning({ id: channels.id });

    if (cloned === undefined) {
      throw new Error("cloning a sandbox channel produced no row");
    }

    channelIds.set(channel.id, cloned.id);
  }

  const templateOverwrites = await tx
    .select()
    .from(channelRoleOverwrites)
    .where(eq(channelRoleOverwrites.serverId, templateId));

  const overwriteValues = templateOverwrites.map((overwrite) => {
    const channelId = channelIds.get(overwrite.channelId);
    const roleId = roleIds.get(overwrite.roleId);

    if (channelId === undefined || roleId === undefined) {
      throw new Error(
        "a template overwrite names a channel or role it does not own",
      );
    }

    return {
      channelId,
      serverId: server.id,
      roleId,
      allow: overwrite.allow,
      deny: overwrite.deny,
    };
  });

  if (overwriteValues.length > 0) {
    await tx.insert(channelRoleOverwrites).values(overwriteValues);
  }

  const templateMembers = await tx
    .select({ userId: serverMembers.userId })
    .from(serverMembers)
    .where(
      and(
        eq(serverMembers.serverId, templateId),
        sql`${serverMembers.userId} <> ${ownerId}`,
      ),
    );

  await tx.insert(serverMembers).values([
    { serverId: server.id, userId: ownerId },
    ...templateMembers.map((member) => ({
      serverId: server.id,
      userId: member.userId,
    })),
  ]);

  const templateAssignments = await tx
    .select()
    .from(memberRoles)
    .where(eq(memberRoles.serverId, templateId));

  const assignmentValues = templateAssignments
    .filter((assignment) => assignment.userId !== ownerId)
    .map((assignment) => {
      const roleId = roleIds.get(assignment.roleId);

      if (roleId === undefined) {
        throw new Error(
          "a template role assignment names a role it does not own",
        );
      }

      return { serverId: server.id, userId: assignment.userId, roleId };
    });

  if (assignmentValues.length > 0) {
    await tx.insert(memberRoles).values(assignmentValues);
  }

  for (const [templateChannelId, target] of channelIds) {
    await tx.execute(sql`
      insert into messages (id, channel_id, author_id, content, created_at)
      select uuidv7(m.created_at - clock_timestamp()), ${target}::uuid,
             m.author_id, m.content, m.created_at
        from messages m
       where m.channel_id = ${templateChannelId}::uuid and m.deleted_at is null
       order by m.id
    `);
  }

  await tx.execute(sql`
    with newest as (
      select distinct on (channel_id) channel_id, id
        from messages
       where deleted_at is null
       order by channel_id, id desc
    )
    update channels c
       set last_message_id = n.id
      from newest n
     where n.channel_id = c.id and c.server_id = ${server.id}::uuid
  `);

  return { serverId: server.id, channelIds: [...channelIds.values()] };
}
