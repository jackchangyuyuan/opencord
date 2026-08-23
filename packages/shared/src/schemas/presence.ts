import { z } from "zod";

export const presenceStatusSchema = z.enum([
  "online",
  "idle",
  "dnd",
  "offline",
]);

export const presenceHeartbeatSchema = z.object({
  status: presenceStatusSchema,
  idle: z.boolean(),
});
