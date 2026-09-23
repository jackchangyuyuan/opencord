import { randomBytes } from "node:crypto";

import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { GUEST_BLOCKED_AUTH_PATHS } from "@opencord/shared/constants";
import { usernameSchema } from "@opencord/shared/schemas";
import { betterAuth } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { anonymous } from "better-auth/plugins/anonymous";

import { config } from "./config.js";
import { db } from "./db/index.js";
import * as schema from "./db/schema/index.js";
import { GUEST_USE_CLAIM } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { deriveUsername } from "./lib/username.js";

function generateGuestUsername(): string {
  return `guest-${randomBytes(8).toString("hex")}`;
}

function guestDisplayName(): string {
  return `Guest ${randomBytes(2).toString("hex")}`;
}

// Better Auth validates an additionalField as a bare string, so the shared
// schema has to be applied here or the reserved prefixes are enforced on the
// client only and anyone can register as a guest. An absent username is the
// signal to mint one, not a violation.
//
// What the schema returns is what gets stored, not merely what gets approved:
// it trims and lowercases, and the unique index is on the column, so storing
// the spelling the request arrived in would let "Ada" and "ada" both exist.
function canonicalUsername(username: unknown): string | undefined {
  if (typeof username !== "string") {
    return undefined;
  }

  const parsed = usernameSchema.safeParse(username);

  if (!parsed.success) {
    throw new APIError("BAD_REQUEST", {
      code: "INVALID_USERNAME",
      message: "That username is not available",
    });
  }

  return parsed.data;
}

// A required additionalField is validated against the provider profile before
// the user is created, and no provider carries a `username`. That check throws
// MISSING_FIELD out of the callback, so the create hook below -- which is what
// mints a username everywhere else -- is never reached on this path.
//
// Deriving it here puts the field in the profile the check reads. The hook
// still runs afterwards and keeps what it finds, so nothing derives twice.
// `overrideUserInfoOnSignIn` is left unset, which is what stops a later
// sign-in from writing this derived handle over a username the user chose.
async function socialProfileUsername(profile: {
  email?: string | null;
  name?: string | null;
}): Promise<{ username: string }> {
  return { username: await deriveUsername(profile.email, profile.name) };
}

const socialProviders = {
  ...(config.GOOGLE_CLIENT_ID !== undefined &&
  config.GOOGLE_CLIENT_SECRET !== undefined
    ? {
        google: {
          clientId: config.GOOGLE_CLIENT_ID,
          clientSecret: config.GOOGLE_CLIENT_SECRET,
          mapProfileToUser: socialProfileUsername,
        },
      }
    : {}),
  ...(config.GITHUB_CLIENT_ID !== undefined &&
  config.GITHUB_CLIENT_SECRET !== undefined
    ? {
        github: {
          clientId: config.GITHUB_CLIENT_ID,
          clientSecret: config.GITHUB_CLIENT_SECRET,
          mapProfileToUser: socialProfileUsername,
        },
      }
    : {}),
};

export const CONFIGURED_SOCIAL_PROVIDERS = Object.keys(socialProviders);

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: config.PUBLIC_ORIGIN,
  database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
  emailAndPassword: { enabled: true },
  rateLimit: { enabled: false },
  socialProviders,
  account: { accountLinking: { enabled: true } },
  plugins: [
    anonymous({
      disableDeleteAnonymousUser: true,
      generateName: guestDisplayName,
    }),
  ],
  secret: config.BETTER_AUTH_SECRET,
  logger: {
    level: "info",
    log: (level, message, ...args) => {
      logger[level]({ args }, message);
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!(GUEST_BLOCKED_AUTH_PATHS as readonly string[]).includes(ctx.path)) {
        return;
      }

      const session = await getSessionFromCtx(ctx);

      if (session?.user["isAnonymous"] === true) {
        throw new APIError("FORBIDDEN", {
          code: GUEST_USE_CLAIM,
          message: "Save your account first",
        });
      }
    }),
  },
  user: {
    additionalFields: {
      username: { type: "string", required: true, unique: true },
      avatarObjectKey: { type: "string", required: false, input: false },
      description: { type: "string", required: false, input: false },
      customStatus: { type: "string", required: false, input: false },
      customStatusEmoji: { type: "string", required: false, input: false },
      deactivatedAt: { type: "date", required: false, input: false },
      guestExpiresAt: { type: "date", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const anonymousUser = user["isAnonymous"] === true;
          const username = canonicalUsername(user["username"]);

          const handle =
            username ??
            (anonymousUser
              ? generateGuestUsername()
              : await deriveUsername(user.email, user.name));

          return {
            data: {
              ...user,
              username: handle,
              ...(anonymousUser
                ? {
                    guestExpiresAt: new Date(Date.now() + config.GUEST_TTL_MS),
                  }
                : {}),
            },
          };
        },
      },
      update: {
        // eslint-disable-next-line @typescript-eslint/require-await
        before: async (user) => {
          const username = canonicalUsername(user["username"]);

          return {
            data: username === undefined ? user : { ...user, username },
          };
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
