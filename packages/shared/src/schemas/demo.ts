import { z } from "zod";

import { NAME_MAX_LENGTH, NAME_MIN_LENGTH } from "../constants/index.js";
import { passwordSchema } from "./auth.js";
import { usernameSchema } from "./common.js";

export const claimAccountSchema = z.object({
  email: z.email(),
  username: usernameSchema,
  password: passwordSchema,
  name: z.string().trim().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH).optional(),
});

export type ClaimAccountInput = z.infer<typeof claimAccountSchema>;
