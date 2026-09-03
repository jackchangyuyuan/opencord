import { z } from "zod";

import { NAME_MAX_LENGTH, NAME_MIN_LENGTH } from "../constants/index.js";

export const serverNameSchema = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH)
  .max(NAME_MAX_LENGTH);

export const createServerSchema = z.object({ name: serverNameSchema });

export type CreateServerInput = z.infer<typeof createServerSchema>;

export const updateServerSchema = z
  .object({
    name: serverNameSchema.optional(),
    iconObjectKey: z.string().min(1).max(512).optional(),
  })
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    "Supply at least one field to update",
  );

export type UpdateServerInput = z.infer<typeof updateServerSchema>;
