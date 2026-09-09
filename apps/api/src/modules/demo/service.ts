import type { ClaimAccountInput } from "@opencord/shared/schemas";
import { APIError } from "better-auth/api";
import { and, eq, isNull } from "drizzle-orm";

import { auth } from "../../auth.js";
import { db } from "../../db/index.js";
import {
  accounts,
  guestQuotas,
  serverMembers,
  users,
} from "../../db/schema/index.js";
import {
  alreadyClaimed,
  emailTaken,
  notAGuest,
  unauthorized,
  usernameTaken,
} from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import {
  UNIQUE_VIOLATION,
  violatedConstraint,
} from "../../lib/postgres-errors.js";
import { joinCreatedServerRooms } from "../../socket/emit.js";
import { openDemoDms } from "./dms.js";
import { refreshDemoPresence } from "./presence.js";
import {
  cloneSandbox,
  findCommunityServerIds,
  findSandboxTemplateId,
  loadCommunityShape,
  placeReadStates,
} from "./queries.js";

export interface GuestSession {
  userId: string;
  setCookie: string[];
}

export interface DemoScenario {
  userId: string;
  serverCount: number;
  dmCount: number;
  sandboxId: string;
  landingChannelId: string | null;
}

export async function createGuestSession(
  headers: Headers,
): Promise<GuestSession> {
  const created = await auth.api.signInAnonymous({
    headers,
    returnHeaders: true,
  });

  return {
    userId: created.response.user.id,
    setCookie: created.headers.getSetCookie(),
  };
}

export async function provisionDemoScenario(
  userId: string,
): Promise<DemoScenario> {
  const templateId = await findSandboxTemplateId();

  if (templateId === undefined) {
    throw new Error("the sandbox template is missing; run db:seed");
  }

  const communityIds = await findCommunityServerIds();
  const shapes = await Promise.all(communityIds.map(loadCommunityShape));

  const scenario = await db.transaction(async (tx) => {
    for (const shape of shapes) {
      await tx
        .insert(serverMembers)
        .values({ serverId: shape.serverId, userId })
        .onConflictDoNothing();

      await placeReadStates(tx, userId, shape.channelIds);
    }

    const sandbox = await cloneSandbox(tx, templateId, userId);

    const dmCount = await openDemoDms(tx, userId);

    await tx.insert(guestQuotas).values({ userId }).onConflictDoNothing();

    return { ...sandbox, dmCount };
  });

  for (const shape of shapes) {
    joinCreatedServerRooms(userId, shape.serverId, shape.channelIds);
  }

  joinCreatedServerRooms(userId, scenario.serverId, scenario.channelIds);

  try {
    await refreshDemoPresence();
  } catch (error) {
    logger.error({ err: error, userId }, "Refreshing demo presence failed");
  }

  logger.info(
    { userId, servers: shapes.length + 1, dms: scenario.dmCount },
    "Provisioned a demo scenario",
  );

  return {
    userId,
    serverCount: shapes.length + 1,
    dmCount: scenario.dmCount,
    sandboxId: scenario.serverId,
    landingChannelId: shapes[0]?.channelIds[0] ?? null,
  };
}

async function requireAvailable(
  userId: string,
  input: ClaimAccountInput,
): Promise<void> {
  const takenEmail = await db.query.users.findFirst({
    columns: { id: true },
    where: { email: input.email },
  });

  if (takenEmail !== undefined && takenEmail.id !== userId) {
    throw emailTaken();
  }

  const takenUsername = await db.query.users.findFirst({
    columns: { id: true },
    where: { username: input.username },
  });

  if (takenUsername !== undefined && takenUsername.id !== userId) {
    throw usernameTaken();
  }
}

export interface ClaimedAccount {
  id: string;
  email: string;
  username: string;
  name: string;
}

async function ensureCredential(
  userId: string,
  headers: Headers,
  password: string,
): Promise<string> {
  const existing = await db.query.accounts.findFirst({
    columns: { id: true },
    where: { userId, providerId: "credential" },
  });

  if (existing !== undefined) {
    return existing.id;
  }

  try {
    await auth.api.setPassword({ headers, body: { newPassword: password } });
  } catch (error) {
    if (!(error instanceof APIError)) {
      throw error;
    }
  }

  const created = await db.query.accounts.findFirst({
    columns: { id: true },
    where: { userId, providerId: "credential" },
  });

  if (created === undefined) {
    throw new Error("setting the guest's password produced no credential");
  }

  return created.id;
}

export async function claimAccount(
  user: { id: string; isAnonymous?: boolean | null | undefined },
  headers: Headers,
  input: ClaimAccountInput,
): Promise<ClaimedAccount> {
  if (user.isAnonymous !== true) {
    throw notAGuest();
  }

  await requireAvailable(user.id, input);

  const credentialId = await ensureCredential(user.id, headers, input.password);

  const hashed = await (await auth.$context).password.hash(input.password);

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .update(users)
        .set({
          email: input.email,
          emailVerified: false,
          username: input.username,
          name: input.name ?? input.username,
          isAnonymous: false,
          guestExpiresAt: null,
        })
        .where(
          and(
            eq(users.id, user.id),
            eq(users.isAnonymous, true),
            isNull(users.deactivatedAt),
          ),
        )
        .returning({
          id: users.id,
          email: users.email,
          username: users.username,
          name: users.name,
        });

      if (row === undefined) {
        const subject = await tx.query.users.findFirst({
          columns: { deactivatedAt: true },
          where: { id: user.id },
        });

        if (subject?.deactivatedAt != null) {
          throw unauthorized("SESSION_EXPIRED", "Session expired");
        }

        throw alreadyClaimed();
      }

      await tx
        .update(accounts)
        .set({ password: hashed })
        .where(eq(accounts.id, credentialId));

      await tx.delete(guestQuotas).where(eq(guestQuotas.userId, user.id));

      return row;
    });
  } catch (error) {
    const constraint = violatedConstraint(error, UNIQUE_VIOLATION);

    if (constraint === "users_email_key") {
      throw emailTaken();
    }

    if (constraint === "users_username_key") {
      throw usernameTaken();
    }

    throw error;
  }
}
