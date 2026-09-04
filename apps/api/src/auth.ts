import { randomBytes } from "node:crypto";

import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { usernameSchema } from "@opencord/shared/schemas";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { anonymous } from "better-auth/plugins/anonymous";

import { config } from "./config.js";
import { db } from "./db/index.js";
import * as schema from "./db/schema/index.js";

function generateGuestUsername(): string {
  return `guest-${randomBytes(8).toString("hex")}`;
}

function guestDisplayName(): string {
  return `Guest ${randomBytes(2).toString("hex")}`;
}

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: config.PUBLIC_ORIGIN,
  database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
  emailAndPassword: { enabled: true },
  rateLimit: { enabled: false },
  plugins: [
    anonymous({
      disableDeleteAnonymousUser: true,
      generateName: () => guestDisplayName(),
    }),
  ],
  secret: config.BETTER_AUTH_SECRET,
  user: {
    additionalFields: {
      username: { type: "string", required: true, unique: true },
      avatarObjectKey: { type: "string", required: false, input: false },
      deactivatedAt: { type: "date", required: false, input: false },
      guestExpiresAt: { type: "date", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: (user) => {
          const username = user["username"];
          const anonymousUser = user["isAnonymous"] === true;

          if (
            typeof username === "string" &&
            !usernameSchema.safeParse(username).success
          ) {
            throw new APIError("BAD_REQUEST", {
              code: "INVALID_USERNAME",
              message: "That username is not available",
            });
          }

          return Promise.resolve({
            data: {
              ...user,
              username:
                typeof username === "string"
                  ? username
                  : generateGuestUsername(),
              ...(anonymousUser
                ? {
                    guestExpiresAt: new Date(Date.now() + config.GUEST_TTL_MS),
                  }
                : {}),
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
