import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";

import { config } from "./config.js";
import { db } from "./db/index.js";
import * as schema from "./db/schema/index.js";

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: config.PUBLIC_ORIGIN,
  database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
  emailAndPassword: { enabled: true },
  secret: config.BETTER_AUTH_SECRET,
});

export type SessionUser = (typeof auth.$Infer.Session)["user"];
