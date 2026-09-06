import type { ClaimAccountInput } from "@opencord/shared/schemas";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";

import { auth } from "../../auth.js";
import { db } from "../../db/index.js";
import { guestQuotas, serverMembers, users } from "../../db/schema/index.js";
import {
  alreadyClaimed,
  emailTaken,
  notAGuest,
  usernameTaken,
} from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { joinCreatedServerRooms } from "../../socket/emit.js";
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

    await tx.insert(guestQuotas).values({ userId }).onConflictDoNothing();

    return sandbox;
  });

  for (const shape of shapes) {
    joinCreatedServerRooms(userId, shape.serverId, shape.channelIds);
  }

  joinCreatedServerRooms(userId, scenario.serverId, scenario.channelIds);

  await refreshDemoPresence();

  logger.info(
    { userId, servers: shapes.length + 1 },
    "Provisioned a demo scenario",
  );

  return {
    userId,
    serverCount: shapes.length + 1,
    sandboxId: scenario.serverId,
    landingChannelId: shapes[0]?.channelIds[0] ?? null,
  };
}

export async function sharesAServer(
  left: string,
  right: string,
): Promise<boolean> {
  const rows = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(eq(serverMembers.userId, left));

  if (rows.length === 0) {
    return false;
  }

  const theirs = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(eq(serverMembers.userId, right));

  const mine = new Set(rows.map((row) => row.serverId));

  return theirs.some((row) => mine.has(row.serverId));
}

const UNIQUE_VIOLATION = "23505";

interface ConstraintViolation {
  constraint: string;
}

function violatedConstraint(error: unknown): string | null {
  const cause = error instanceof Error ? error.cause : error;

  if (
    !(cause instanceof postgres.PostgresError) ||
    cause.code !== UNIQUE_VIOLATION
  ) {
    return null;
  }

  return (cause as unknown as ConstraintViolation).constraint;
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

export async function claimAccount(
  user: { id: string; isAnonymous?: boolean | null | undefined },
  headers: Headers,
  input: ClaimAccountInput,
): Promise<ClaimedAccount> {
  if (user.isAnonymous !== true) {
    throw notAGuest();
  }

  await requireAvailable(user.id, input);

  const credential = await db.query.accounts.findFirst({
    columns: { id: true },
    where: { userId: user.id, providerId: "credential" },
  });

  if (credential === undefined) {
    await auth.api.setPassword({
      headers,
      body: { newPassword: input.password },
    });
  }

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
        .where(and(eq(users.id, user.id), eq(users.isAnonymous, true)))
        .returning({
          id: users.id,
          email: users.email,
          username: users.username,
          name: users.name,
        });

      if (row === undefined) {
        throw alreadyClaimed();
      }

      await tx.delete(guestQuotas).where(eq(guestQuotas.userId, user.id));

      return row;
    });
  } catch (error) {
    const constraint = violatedConstraint(error);

    if (constraint === "users_email_key") {
      throw emailTaken();
    }

    if (constraint === "users_username_key") {
      throw usernameTaken();
    }

    throw error;
  }
}
