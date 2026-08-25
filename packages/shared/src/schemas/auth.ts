import { z } from "zod";

import {
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../constants/index.js";
import { usernameSchema } from "./common.js";

export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Use at least ${String(PASSWORD_MIN_LENGTH)} characters`,
  )
  .max(PASSWORD_MAX_LENGTH);

export const signInSchema = z.object({
  email: z.email(),
  password: passwordSchema,
});

export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH),
  username: usernameSchema,
  password: passwordSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
