import { and, eq, sql } from "drizzle-orm";

import { db, type Transaction } from "../../db/index.js";
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
import { COMMUNITY_SERVER_NAMES } from "../../db/seed/community.js";
import { SANDBOX_TEMPLATE_NAME } from "../../db/seed/sandbox.js";

export async function findCommunityServerIds(): Promise<string[]> {
  const rows = await db
    .select({ id: servers.id })
    .from(servers)
    .where(
      sql`${servers.name} = any(array[${sql.join(
        COMMUNITY_SERVER_NAMES.map((name) => sql`${name}`),
        sql`, `,
      )}]::text[])`,
    );

  return rows.map((row) => row.id);
}

export async function findSandboxTemplateId(): Promise<string | undefined> {
  const row = await db.query.servers.findFirst({
    columns: { id: true },
    where: { name: SANDBOX_TEMPLATE_NAME },
  });

  return row?.id;
}

export interface CommunityShape {
  serverId: string;
  channelIds: string[];
}

export async function loadCommunityShape(
  serverId: string,
): Promise<CommunityShape> {
  const channelRows = await db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.serverId, serverId))
    .orderBy(channels.position, channels.id);

  return { serverId, channelIds: channelRows.map((row) => row.id) };
}

export async function placeReadStates(
  tx: Transaction,
  userId: string,
  channelIds: readonly string[],
): Promise<void> {
  const marked = channelIds.filter((_channelId, index) => index % 2 === 0);

  for (const channelId of marked) {
    const [row] = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.channelId, channelId))
      .orderBy(sql`${messages.id} desc`)
      .limit(1)
      .offset(12);

    if (row === undefined) {
      continue;
    }

    await tx
      .insert(readStates)
      .values({ userId, channelId, lastReadMessageId: row.id })
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

  const clonedRoles = await tx
    .insert(roles)
    .values(
      templateRoles.map((role) => ({
        serverId: server.id,
        name: role.name,
        color: role.color,
        permissions: role.permissions,
        position: role.position,
        isDefault: role.isDefault,
      })),
    )
    .returning({ id: roles.id, name: roles.name });

  const roleByName = new Map(clonedRoles.map((role) => [role.name, role.id]));
  const templateRoleName = new Map(
    templateRoles.map((role) => [role.id, role.name]),
  );

  const templateChannels = await tx
    .select()
    .from(channels)
    .where(eq(channels.serverId, templateId))
    .orderBy(channels.position, channels.id);

  const clonedChannels = await tx
    .insert(channels)
    .values(
      templateChannels.map((channel) => ({
        serverId: server.id,
        type: channel.type,
        name: channel.name,
        topic: channel.topic,
        position: channel.position,
      })),
    )
    .returning({ id: channels.id, name: channels.name });

  const channelByName = new Map(
    clonedChannels.flatMap((channel) =>
      channel.name === null ? [] : [[channel.name, channel.id] as const],
    ),
  );

  const templateOverwrites = await tx
    .select()
    .from(channelRoleOverwrites)
    .where(eq(channelRoleOverwrites.serverId, templateId));

  const overwriteValues = templateOverwrites.flatMap((overwrite) => {
    const channelName =
      templateChannels.find((channel) => channel.id === overwrite.channelId)
        ?.name ?? null;
    const roleName = templateRoleName.get(overwrite.roleId);
    const channelId =
      channelName === null ? undefined : channelByName.get(channelName);
    const roleId =
      roleName === undefined ? undefined : roleByName.get(roleName);

    return channelId === undefined || roleId === undefined
      ? []
      : [
          {
            channelId,
            serverId: server.id,
            roleId,
            allow: overwrite.allow,
            deny: overwrite.deny,
          },
        ];
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

  const assignmentValues = templateAssignments.flatMap((assignment) => {
    const roleName = templateRoleName.get(assignment.roleId);
    const roleId =
      roleName === undefined ? undefined : roleByName.get(roleName);

    return roleId === undefined || assignment.userId === ownerId
      ? []
      : [{ serverId: server.id, userId: assignment.userId, roleId }];
  });

  if (assignmentValues.length > 0) {
    await tx.insert(memberRoles).values(assignmentValues);
  }

  for (const channel of templateChannels) {
    const target =
      channel.name === null ? undefined : channelByName.get(channel.name);

    if (target === undefined) {
      continue;
    }

    await tx.execute(sql`
      insert into messages (id, channel_id, author_id, content, created_at)
      select uuidv7(m.created_at - clock_timestamp()), ${target}::uuid,
             m.author_id, m.content, m.created_at
        from messages m
       where m.channel_id = ${channel.id}::uuid and m.deleted_at is null
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

  return {
    serverId: server.id,
    channelIds: clonedChannels.map((channel) => channel.id),
  };
}
