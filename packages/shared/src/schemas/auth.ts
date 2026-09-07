import { z } from "zod";

import {
  CUSTOM_STATUS_EMOJI_MAX_LENGTH,
  CUSTOM_STATUS_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../constants/index.js";
import { usernameSchema } from "./common.js";

export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Use at least ${String(PASSWORD_MIN_LENGTH)} characters`,
  )
  .max(PASSWORD_MAX_LENGTH);

export const signInSchema = z.object({
  email: z.email(),
  password: passwordSchema,
});

export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH),
  username: usernameSchema,
  password: passwordSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export function normalizeProfileText(value: string): string | null {
  const collapsed = value
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();

  return collapsed === "" ? null : collapsed;
}

export function normalizeCustomStatus(value: string): string | null {
  return normalizeProfileText(value.replaceAll(/\s+/g, " "));
}

export const descriptionSchema = z
  .string()
  .max(
    DESCRIPTION_MAX_LENGTH,
    `Keep it to ${String(DESCRIPTION_MAX_LENGTH)} characters`,
  );

export const customStatusSchema = z
  .string()
  .max(
    CUSTOM_STATUS_MAX_LENGTH,
    `Keep it to ${String(CUSTOM_STATUS_MAX_LENGTH)} characters`,
  );

export const customStatusEmojiSchema = z
  .string()
  .trim()
  .max(CUSTOM_STATUS_EMOJI_MAX_LENGTH)
  .regex(
    /^(?=.*\p{Extended_Pictographic})(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u200D|\uFE0F)+$/u,
    "Use a single emoji",
  );

export const updateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(NAME_MIN_LENGTH)
      .max(NAME_MAX_LENGTH)
      .optional(),
    avatarObjectKey: z.string().min(1).max(512).optional(),
    description: descriptionSchema.nullable().optional(),
    customStatus: customStatusSchema.nullable().optional(),
    customStatusEmoji: customStatusEmojiSchema.nullable().optional(),
  })
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    "Supply at least one field to update",
  );

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
