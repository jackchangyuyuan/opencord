import type { MessagePageQuery } from "@opencord/shared/schemas";
import type { Message } from "@opencord/shared/types";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  type SQL,
  sql,
} from "drizzle-orm";

import { db } from "../../db/index.js";
import {
  channelMembers,
  channels,
  memberRoles,
  messages,
  roles,
  serverMembers,
  users,
} from "../../db/schema/index.js";
import { decodeCursor, encodeCursor } from "../../lib/cursor.js";
import { AppError } from "../../lib/errors.js";
import type { MentionCandidates, MentionResolution } from "./mentions.js";

export const messageColumns = {
  id: messages.id,
  channelId: messages.channelId,
  authorId: messages.authorId,
  content: messages.content,
  nonce: messages.nonce,
  replyToId: messages.replyToId,
  mentionsEveryone: messages.mentionsEveryone,
  pinnedAt: messages.pinnedAt,
  pinnedBy: messages.pinnedBy,
  editedAt: messages.editedAt,
  deletedAt: messages.deletedAt,
  createdAt: messages.createdAt,
};

export type MessageRow = Omit<typeof messages.$inferSelect, "searchVector">;

export type MessageBase = Omit<
  Message,
  "attachments" | "reactions" | "replyTo"
>;

export function serializeMessage(message: MessageRow): MessageBase {
  return {
    id: message.id,
    channelId: message.channelId,
    authorId: message.authorId,
    content: message.content,
    nonce: message.nonce,
    replyToId: message.replyToId,
    pinnedAt: message.pinnedAt?.toISOString() ?? null,
    pinnedBy: message.pinnedBy,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function findMessageByNonce(
  authorId: string,
  nonce: string,
): Promise<MessageRow | undefined> {
  const [message] = await db
    .select(messageColumns)
    .from(messages)
    .where(and(eq(messages.authorId, authorId), eq(messages.nonce, nonce)));

  return message;
}

export async function findLiveMessage(
  channelId: string,
  messageId: string,
): Promise<MessageRow | undefined> {
  const [message] = await db
    .select(messageColumns)
    .from(messages)
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.channelId, channelId),
        isNull(messages.deletedAt),
      ),
    );

  return message;
}

export interface MessagePage {
  rows: MessageRow[];
  nextCursor: string | null;
}

function cursorOrThrow(cursor: string): string {
  const id = decodeCursor(cursor);

  if (id === null) {
    throw new AppError(400, "INVALID_CURSOR", "Malformed pagination cursor");
  }

  return id;
}

function livePage(
  channelId: string,
  bound: SQL | undefined,
  ascending: boolean,
  limit: number,
): Promise<MessageRow[]> {
  return db
    .select(messageColumns)
    .from(messages)
    .where(
      and(eq(messages.channelId, channelId), isNull(messages.deletedAt), bound),
    )
    .orderBy(ascending ? asc(messages.id) : desc(messages.id))
    .limit(limit);
}

async function around(
  channelId: string,
  anchor: string,
  limit: number,
): Promise<MessagePage> {
  const olderLimit = Math.ceil(limit / 2);
  const newerLimit = limit - olderLimit;

  const older = await livePage(
    channelId,
    lte(messages.id, anchor),
    false,
    olderLimit,
  );
  const newer =
    newerLimit === 0
      ? []
      : await livePage(channelId, gt(messages.id, anchor), true, newerLimit);

  return { rows: [...older.reverse(), ...newer], nextCursor: null };
}

export async function listChannelMessages(
  channelId: string,
  query: MessagePageQuery,
): Promise<MessagePage> {
  if (query.around !== undefined) {
    return around(channelId, cursorOrThrow(query.around), query.limit);
  }

  if (query.after !== undefined) {
    const rows = await livePage(
      channelId,
      gt(messages.id, cursorOrThrow(query.after)),
      true,
      query.limit + 1,
    );

    return paginate(rows, query.limit);
  }

  const rows = await livePage(
    channelId,
    query.before === undefined
      ? undefined
      : lt(messages.id, cursorOrThrow(query.before)),
    false,
    query.limit + 1,
  );

  return paginate(rows, query.limit);
}

function paginate(rows: MessageRow[], limit: number): MessagePage {
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    rows: page,
    nextCursor:
      rows.length > limit && last !== undefined ? encodeCursor(last.id) : null,
  };
}

export interface ServerMentionResolution {
  resolution: MentionResolution;
  roleMemberIds: string[];
}

function firstByName(
  rows: { id: string; name: string | null }[],
): Map<string, string> {
  const byName = new Map<string, string>();

  for (const row of rows) {
    const name = row.name ?? "";

    if (!byName.has(name)) {
      byName.set(name, row.id);
    }
  }

  return byName;
}

export async function resolveServerMentions(
  serverId: string,
  candidates: MentionCandidates,
  accessibleChannels: ReadonlySet<string>,
): Promise<ServerMentionResolution> {
  const userRows =
    candidates.names.length === 0
      ? []
      : await db
          .select({ id: users.id, username: users.username })
          .from(serverMembers)
          .innerJoin(users, eq(users.id, serverMembers.userId))
          .where(
            and(
              eq(serverMembers.serverId, serverId),
              inArray(users.username, candidates.names),
            ),
          );

  const roleRows =
    candidates.names.length === 0
      ? []
      : await db
          .select({ id: roles.id, name: roles.name })
          .from(roles)
          .where(
            and(
              eq(roles.serverId, serverId),
              inArray(sql`lower(${roles.name})`, candidates.names),
            ),
          )
          .orderBy(desc(roles.position), roles.id);

  const roleByName = new Map<string, string>();

  for (const row of roleRows) {
    const name = row.name.toLowerCase();

    if (!roleByName.has(name)) {
      roleByName.set(name, row.id);
    }
  }

  const shadowed = new Set(userRows.map((row) => row.username.toLowerCase()));

  const mentionedRoleIds = [...roleByName]
    .filter(([name]) => !shadowed.has(name))
    .map(([, id]) => id);

  const roleMemberRows =
    mentionedRoleIds.length === 0
      ? []
      : await db
          .select({ userId: memberRoles.userId })
          .from(memberRoles)
          .where(
            and(
              eq(memberRoles.serverId, serverId),
              inArray(memberRoles.roleId, mentionedRoleIds),
            ),
          );

  const channelRows =
    candidates.channels.length === 0
      ? []
      : (
          await db
            .select({ id: channels.id, name: channels.name })
            .from(channels)
            .where(
              and(
                eq(channels.serverId, serverId),
                inArray(channels.name, candidates.channels),
              ),
            )
            .orderBy(channels.position, channels.id)
        ).filter((row) => accessibleChannels.has(row.id));

  return {
    resolution: {
      users: new Map(userRows.map((row) => [row.username, row.id])),
      roles: roleByName,
      channels: firstByName(channelRows),
    },
    roleMemberIds: [...new Set(roleMemberRows.map((row) => row.userId))],
  };
}

export async function resolveDmMentions(
  channelId: string,
  candidates: MentionCandidates,
): Promise<MentionResolution> {
  const rows =
    candidates.names.length === 0
      ? []
      : await db
          .select({ id: users.id, username: users.username })
          .from(channelMembers)
          .innerJoin(users, eq(users.id, channelMembers.userId))
          .where(
            and(
              eq(channelMembers.channelId, channelId),
              inArray(users.username, candidates.names),
            ),
          );

  return {
    users: new Map(rows.map((row) => [row.username, row.id])),
    roles: new Map(),
    channels: new Map(),
  };
}
