import { z } from "zod";

const baseSchema = z.object({
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_REGION: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  DATABASE_URL: z.url(),
  INSTANCE_ID: z.string().min(1).default("api-dev"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_ORIGIN: z.url(),
  REDIS_URL: z.url(),
  S3_BUCKET: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/,
      "must be DNS-compliant: 3-63 lowercase characters, no dots or underscores",
    ),
  S3_ENDPOINT: z.url().optional(),
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  STORAGE_PUBLIC_ORIGIN: z.url(),
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
