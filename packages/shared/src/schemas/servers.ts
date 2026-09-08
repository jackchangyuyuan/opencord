import { z } from "zod";

import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_GROUPS,
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

const auditDaySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((day) => !Number.isNaN(Date.parse(`${day}T00:00:00Z`)), "Not a day");

function startOfDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function startOfNextDay(day: string): Date {
  return new Date(startOfDay(day).getTime() + 24 * 60 * 60 * 1000);
}

const auditActionsSchema = z
  .preprocess(
    (value) =>
      value === undefined
        ? undefined
        : (Array.isArray(value) ? value : [value])
            .flatMap((entry) => String(entry).split(","))
            .map((entry) => entry.trim())
            .filter((entry) => entry !== ""),
    z.array(z.enum(AUDIT_ACTIONS)).max(AUDIT_ACTIONS.length),
  )
  .optional();

export const auditLogPageSchema = paginationSchema.extend({
  action: auditActionsSchema,
  actorId: z.string().min(1).max(255).optional(),
  target: z
    .enum(
      Object.keys(AUDIT_TARGET_GROUPS) as [
        keyof typeof AUDIT_TARGET_GROUPS,
        ...(keyof typeof AUDIT_TARGET_GROUPS)[],
      ],
    )
    .optional(),
  from: auditDaySchema.transform(startOfDay).optional(),
  to: auditDaySchema.transform(startOfNextDay).optional(),
  q: z.string().trim().min(1).max(NAME_MAX_LENGTH).optional(),
});

export type AuditLogPageQuery = z.infer<typeof auditLogPageSchema>;
