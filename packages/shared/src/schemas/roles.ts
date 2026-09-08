import { z } from "zod";

import {
  MAX_ROLES_PER_REORDER,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
} from "../constants/index.js";
import { permissionMaskSchema } from "./common.js";

export const roleNameSchema = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH)
  .max(NAME_MAX_LENGTH);

export const roleColorSchema = z.int().min(0).max(0xffffff);

export const rolePositionSchema = z.int().min(1);

export const createRoleSchema = z.object({
  name: roleNameSchema,
  color: roleColorSchema.nullable().optional(),
  permissions: permissionMaskSchema.default(0),
  position: rolePositionSchema.optional(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z
  .object({
    name: roleNameSchema.optional(),
    color: roleColorSchema.nullable().optional(),
    permissions: permissionMaskSchema.optional(),
    position: rolePositionSchema.optional(),
  })
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    "Supply at least one field to update",
  );

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const reorderRolesSchema = z.object({
  roleIds: z.array(z.uuid()).min(1).max(MAX_ROLES_PER_REORDER),
});

export type ReorderRolesInput = z.infer<typeof reorderRolesSchema>;
