import { randomBytes } from "node:crypto";

import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";

import { config } from "./config.js";
import { db } from "./db/index.js";
import * as schema from "./db/schema/index.js";

function generateGuestUsername(): string {
  return `guest-${randomBytes(8).toString("hex")}`;
}

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: config.PUBLIC_ORIGIN,
  database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
  emailAndPassword: { enabled: true },
  secret: config.BETTER_AUTH_SECRET,
  user: {
    additionalFields: {
      username: { type: "string", required: true, unique: true },
      deactivatedAt: { type: "date", required: false, input: false },
      guestExpiresAt: { type: "date", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: (user) => {
          const username = user["username"];

          return Promise.resolve({
            data: {
              ...user,
              username:
                typeof username === "string"
                  ? username
                  : generateGuestUsername(),
            },
          });
        },
      },
    },
  },
});

export type SessionUser = (typeof auth.$Infer.Session)["user"];

export function isRevoked(user: SessionUser, now: Date): boolean {
  const deactivatedAt = user.deactivatedAt ?? null;
  const guestExpiresAt = user.guestExpiresAt ?? null;

  return (
    deactivatedAt !== null || (guestExpiresAt !== null && guestExpiresAt <= now)
  );
}
