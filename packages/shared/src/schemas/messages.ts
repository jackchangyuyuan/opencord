import { z } from "zod";

import { MESSAGE_MAX_LENGTH, MESSAGE_MIN_LENGTH } from "../constants/index.js";

export const messageContentSchema = z
  .string()
  .trim()
  .min(MESSAGE_MIN_LENGTH)
  .max(MESSAGE_MAX_LENGTH);

export const sendMessageSchema = z.object({
  content: messageContentSchema,
  nonce: z.uuid(),
  replyToId: z.uuid().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({ content: messageContentSchema });

export type EditMessageInput = z.infer<typeof editMessageSchema>;
