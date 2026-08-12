import { z } from "zod";

const baseSchema = z.object({
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

const LOG_LEVEL_DEFAULT = {
  test: "silent",
  development: "info",
  production: "info",
} as const;

const envSchema = baseSchema.transform((env) => ({
  ...env,
  LOG_LEVEL: env.LOG_LEVEL ?? LOG_LEVEL_DEFAULT[env.NODE_ENV],
}));

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  process.stderr.write(
    `Invalid environment:\n${z.prettifyError(parsed.error)}\n`,
  );
  process.exit(1);
}

export const config = parsed.data;
