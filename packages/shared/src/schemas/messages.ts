import { z } from "zod";

import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
} from "../constants/index.js";
import { uploadFilenameSchema } from "./uploads.js";

export const messageAttachmentSchema = z.object({
  objectKey: z.string().min(1).max(512),
  filename: uploadFilenameSchema,
  width: z.int().optional(),
  height: z.int().optional(),
});

export type MessageAttachmentInput = z.infer<typeof messageAttachmentSchema>;

export const sendMessageSchema = z
  .object({
    content: z.string().trim().max(MESSAGE_MAX_LENGTH),
    nonce: z.uuid(),
    replyToId: z.uuid().optional(),
    attachments: z
      .array(messageAttachmentSchema)
      .max(MAX_ATTACHMENTS_PER_MESSAGE)
      .optional(),
  })
  .check((ctx) => {
    if (
      ctx.value.content.length < MESSAGE_MIN_LENGTH &&
      (ctx.value.attachments ?? []).length === 0
    ) {
      ctx.issues.push({
        code: "too_small",
        origin: "string",
        minimum: MESSAGE_MIN_LENGTH,
        inclusive: true,
        input: ctx.value.content,
        path: ["content"],
      });
    }
  });

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  content: z.string().trim().max(MESSAGE_MAX_LENGTH),
});

export type EditMessageInput = z.infer<typeof editMessageSchema>;
