import { z } from "zod";

import { NAME_MAX_LENGTH, NAME_MIN_LENGTH } from "../constants/index.js";

export const createServerSchema = z.object({
  name: z.string().trim().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH),
});

export type CreateServerInput = z.infer<typeof createServerSchema>;
