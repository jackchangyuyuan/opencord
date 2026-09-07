import { z } from "zod";

import {
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
} from "../constants/index.js";
import { paginationSchema } from "./common.js";

export const serverNameSchema = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH)
  .max(NAME_MAX_LENGTH);

export const serverDescriptionSchema = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX_LENGTH)
  .transform((value) => (value === "" ? null : value))
  .nullable();

export const createServerSchema = z.object({ name: serverNameSchema });

export type CreateServerInput = z.infer<typeof createServerSchema>;

export const updateServerSchema = z
  .object({
    name: serverNameSchema.optional(),
    description: serverDescriptionSchema.optional(),
    iconObjectKey: z.string().min(1).max(512).optional(),
  })
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    "Supply at least one field to update",
  );

export type UpdateServerInput = z.infer<typeof updateServerSchema>;

export const memberPageSchema = paginationSchema.extend({
  q: z.string().trim().min(1).max(NAME_MAX_LENGTH).optional(),
});

export type MemberPageQuery = z.infer<typeof memberPageSchema>;
