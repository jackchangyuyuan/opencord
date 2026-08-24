import { z } from "zod";

export const typingStartSchema = z.object({
  channelId: z.uuid(),
});
