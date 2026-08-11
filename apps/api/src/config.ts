import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  process.stderr.write(
    `Invalid environment:\n${z.prettifyError(parsed.error)}\n`,
  );
  process.exit(1);
}

export const config = parsed.data;
