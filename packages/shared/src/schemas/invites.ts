import { z } from "zod";

export const INVITE_CODE_LENGTH = 8;

export const inviteCodeSchema = z
  .string()
  .trim()
  .length(INVITE_CODE_LENGTH)
  .regex(/^[\w-]+$/);

export const createInviteSchema = z.object({
  maxUses: z.int().min(1).max(1000).nullable().default(null),
  expiresInHours: z
    .int()
    .min(1)
    .max(24 * 30)
    .nullable()
    .default(null),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
