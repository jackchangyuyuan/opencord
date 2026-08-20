import { z } from "zod";

import {
  CHANNEL_TOPIC_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
} from "../constants/index.js";
import { ALL_PERMISSIONS } from "../permissions/index.js";

export const channelNameSchema = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH)
  .max(NAME_MAX_LENGTH)
  .regex(/^[a-z0-9-]+$/, "Use only lowercase letters, digits and -");

export const channelTopicSchema = z
  .string()
  .trim()
  .max(CHANNEL_TOPIC_MAX_LENGTH);

export const createChannelSchema = z.object({
  name: channelNameSchema,
  topic: channelTopicSchema.optional(),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = z
  .object({
    name: channelNameSchema.optional(),
    topic: channelTopicSchema.nullable().optional(),
    position: z.int().min(0).optional(),
  })
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    "Supply at least one field to update",
  );

export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

export const permissionMaskSchema = z.int().min(0).max(ALL_PERMISSIONS);

export const overwriteSchema = z.object({
  allow: permissionMaskSchema.default(0),
  deny: permissionMaskSchema.default(0),
});

export type OverwriteInput = z.infer<typeof overwriteSchema>;
