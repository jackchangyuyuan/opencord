import { randomUUID } from "node:crypto";

import {
  DIMENSION_MAX,
  DIMENSION_MIN,
  UPLOAD_EXTENSION,
  UPLOAD_PREFIX,
  type UploadContentType,
} from "@opencord/shared/constants";
import type { MessageAttachmentInput } from "@opencord/shared/schemas";
import type { MessageAttachment } from "@opencord/shared/types";
import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Transaction } from "../../db/index.js";
import { db } from "../../db/index.js";
import { attachments, messages } from "../../db/schema/index.js";
import { copyObject } from "../../lib/storage.js";
import { requireOwnedUpload } from "../uploads/associate.js";

export interface PreparedAttachment {
  objectKey: string;
  filename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
}

function dimension(value: number | undefined): number | null {
  return value !== undefined && value >= DIMENSION_MIN && value <= DIMENSION_MAX
    ? value
    : null;
}

function storedKey(authorId: string, contentType: UploadContentType): string {
  return `${UPLOAD_PREFIX.attachment}/${authorId}/stored/${randomUUID()}.${UPLOAD_EXTENSION[contentType]}`;
}

export async function prepareAttachments(
  authorId: string,
  inputs: readonly MessageAttachmentInput[],
): Promise<PreparedAttachment[]> {
  const prepared: PreparedAttachment[] = [];

  for (const input of inputs) {
    const stored = await requireOwnedUpload(
      "attachment",
      authorId,
      input.objectKey,
    );

    const objectKey = storedKey(authorId, stored.contentType);

    await copyObject(input.objectKey, objectKey);

    prepared.push({
      objectKey,
      filename: input.filename,
      contentType: stored.contentType,
      size: stored.size,
      width: dimension(input.width),
      height: dimension(input.height),
    });
  }

  return prepared;
}

export async function writeAttachments(
  tx: Transaction,
  messageId: string,
  prepared: readonly PreparedAttachment[],
): Promise<void> {
  if (prepared.length === 0) {
    return;
  }

  await tx
    .insert(attachments)
    .values(prepared.map((row) => ({ ...row, messageId })));
}

export async function hasAttachments(messageId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(eq(attachments.messageId, messageId))
    .limit(1);

  return row !== undefined;
}

export type AttachmentRow = Omit<MessageAttachment, "url">;

export async function loadAttachments(
  messageIds: readonly string[],
): Promise<Map<string, AttachmentRow[]>> {
  const byMessage = new Map<string, AttachmentRow[]>();

  if (messageIds.length === 0) {
    return byMessage;
  }

  const rows = await db
    .select()
    .from(attachments)
    .where(inArray(attachments.messageId, [...messageIds]));

  for (const row of rows) {
    const list = byMessage.get(row.messageId) ?? [];

    list.push({
      id: row.id,
      objectKey: row.objectKey,
      filename: row.filename,
      contentType: row.contentType,
      size: row.size,
      width: row.width,
      height: row.height,
    });

    byMessage.set(row.messageId, list);
  }

  return byMessage;
}

export async function findChannelAttachment(
  channelId: string,
  attachmentId: string,
): Promise<{ objectKey: string } | undefined> {
  const [row] = await db
    .select({ objectKey: attachments.objectKey })
    .from(attachments)
    .innerJoin(messages, eq(messages.id, attachments.messageId))
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(messages.channelId, channelId),
        isNull(messages.deletedAt),
      ),
    );

  return row;
}

export function attachmentUrl(channelId: string, attachmentId: string): string {
  return `/api/v1/channels/${channelId}/attachments/${attachmentId}`;
}

export function serializeAttachments(
  channelId: string,
  rows: readonly AttachmentRow[],
): MessageAttachment[] {
  return rows.map((row) => ({ ...row, url: attachmentUrl(channelId, row.id) }));
}
