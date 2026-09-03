import {
  DIMENSION_MAX,
  DIMENSION_MIN,
  UPLOAD_ASSOCIATION_WINDOW_MS,
  UPLOAD_CONTENT_TYPES,
  UPLOAD_PREFIX,
} from "@opencord/shared/constants";
import type { MessageAttachmentInput } from "@opencord/shared/schemas";
import type { MessageAttachment } from "@opencord/shared/types";
import { eq, inArray } from "drizzle-orm";

import { db, type Transaction } from "../../db/index.js";
import { attachments } from "../../db/schema/index.js";
import {
  AppError,
  uploadKeyForbidden,
  uploadNotFound,
} from "../../lib/errors.js";
import { deleteObject, headObject, signMediaUrl } from "../../lib/storage.js";

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

function isAllowedType(contentType: string): boolean {
  return (UPLOAD_CONTENT_TYPES as readonly string[]).includes(contentType);
}

export async function prepareAttachments(
  authorId: string,
  inputs: readonly MessageAttachmentInput[],
): Promise<PreparedAttachment[]> {
  const prepared: PreparedAttachment[] = [];

  for (const input of inputs) {
    if (
      !input.objectKey.startsWith(`${UPLOAD_PREFIX.attachment}/${authorId}/`)
    ) {
      throw uploadKeyForbidden();
    }

    const stored = await headObject(input.objectKey);

    if (stored === null) {
      throw uploadNotFound();
    }

    const expired =
      Date.now() - stored.lastModified.getTime() > UPLOAD_ASSOCIATION_WINDOW_MS;

    if (expired || !isAllowedType(stored.contentType)) {
      await deleteObject(input.objectKey);

      throw new AppError(
        400,
        "UPLOAD_REJECTED",
        expired
          ? "That upload is too old to attach"
          : "That upload is not an accepted image type",
      );
    }

    prepared.push({
      objectKey: input.objectKey,
      filename: input.filename,
      contentType: stored.contentType,
      size: stored.size,
      width: dimension(input.width),
      height: dimension(input.height),
    });
  }

  return prepared;
}

export function writeAttachments(
  tx: Transaction,
  messageId: string,
  prepared: readonly PreparedAttachment[],
): Promise<unknown> {
  if (prepared.length === 0) {
    return Promise.resolve();
  }

  return tx
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

export function signAttachments(
  rows: readonly AttachmentRow[],
  isPublic: boolean,
): Promise<MessageAttachment[]> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      url: await signMediaUrl(row.objectKey, isPublic),
    })),
  );
}
