import { z } from "zod";

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  RESERVED_USERNAME_PREFIXES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "../constants/index.js";
import { ALL_PERMISSIONS } from "../permissions/index.js";

export const permissionMaskSchema = z.int().min(0).max(ALL_PERMISSIONS);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .regex(/^[a-z0-9_.-]+$/, "Use only letters, digits, and _ . -")
  .refine(
    (username) =>
      !RESERVED_USERNAME_PREFIXES.some((prefix) => username.startsWith(prefix)),
    "That username is reserved",
  );

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const messagePageSchema = z
  .object({
    before: z.string().min(1).optional(),
    after: z.string().min(1).optional(),
    around: z.string().min(1).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE)
      .default(DEFAULT_PAGE_SIZE),
  })
  .refine(
    (input) =>
      [input.before, input.after, input.around].filter(
        (cursor) => cursor !== undefined,
      ).length <= 1,
    "Supply at most one of before, after or around",
  );

export type MessagePageQuery = z.infer<typeof messagePageSchema>;
