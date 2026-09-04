import { eq } from "drizzle-orm";

import { auth } from "../../auth.js";
import { db } from "../../db/index.js";
import { guestQuotas, serverMembers } from "../../db/schema/index.js";
import { logger } from "../../lib/logger.js";
import { joinCreatedServerRooms } from "../../socket/emit.js";
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
