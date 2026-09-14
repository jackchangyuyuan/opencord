import { z } from "zod";

const optionalCredential = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const baseSchema = z.object({
  AMBIENT_ACTIVITY_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(40_000),
  AMBIENT_ACTIVITY_RETENTION_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .default(6 * 60 * 60 * 1000),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_REGION: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  DATABASE_URL: z.url(),
  GITHUB_CLIENT_ID: optionalCredential,
  GITHUB_CLIENT_SECRET: optionalCredential,
  GOOGLE_CLIENT_ID: optionalCredential,
  GOOGLE_CLIENT_SECRET: optionalCredential,
  GUEST_INVITE_CEILING: z.coerce.number().int().min(1).default(20),
  GUEST_MESSAGE_CEILING: z.coerce.number().int().min(1).default(200),
  GUEST_SERVER_CEILING: z.coerce.number().int().min(1).default(5),
  GUEST_UPLOAD_BYTES_CEILING: z.coerce
    .number()
    .int()
    .min(1)
    .default(25 * 1024 * 1024),
  GUEST_UPLOAD_GRANT_CEILING: z.coerce.number().int().min(1).default(10),
  GUEST_TTL_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .default(45 * 60 * 1000),
  INSTANCE_ID: z.string().min(1).default("api-dev"),
  JOB_LOCK_NAMESPACE: z.string().min(1).default("jobs"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional(),
  MEDIA_URL_SIGNING_BUCKET: z.coerce.number().int().min(1).default(3600),
  MEDIA_URL_TTL_PRIVATE: z.coerce.number().int().min(1).default(900),
  MEDIA_URL_TTL_PUBLIC: z.coerce.number().int().min(1).default(86_400),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PRESENCE_NAMESPACE: z.string().min(1).default("presence"),
  PUBLIC_ORIGIN: z.url(),
  RATE_LIMIT_AUTH_POINTS: z.coerce.number().int().min(1).default(20),
  RATE_LIMIT_CLAIM_POINTS: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_CREATE_POINTS: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_DEMO_DAILY_POINTS: z.coerce.number().int().min(1).default(500),
  RATE_LIMIT_DEMO_POINTS: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_HEARTBEAT_POINTS: z.coerce.number().int().min(1).default(1),
  RATE_LIMIT_INVITE_POINTS: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_MESSAGE_POINTS: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_NAMESPACE: z.string().min(1).default("rl"),
  RATE_LIMIT_SEARCH_POINTS: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_TYPING_POINTS: z.coerce.number().int().min(1).default(1),
  RATE_LIMIT_UPLOAD_POINTS: z.coerce.number().int().min(1).default(20),
  REDIS_URL: z.url(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
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

function completePair(
  env: z.infer<typeof baseSchema>,
  ctx: z.RefinementCtx,
  id: "GITHUB_CLIENT_ID" | "GOOGLE_CLIENT_ID",
  secret: "GITHUB_CLIENT_SECRET" | "GOOGLE_CLIENT_SECRET",
): void {
  if ((env[id] === undefined) === (env[secret] === undefined)) {
    return;
  }

  ctx.addIssue({
    code: "custom",
    path: [env[id] === undefined ? id : secret],
    message: `${id} and ${secret} must be set together`,
  });
}

const envSchema = baseSchema
  .superRefine((env, ctx) => {
    completePair(env, ctx, "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET");
    completePair(env, ctx, "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
  })
  .transform((env) => ({
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
