import { db } from "../../db/index.js";
import { channelMembers, channels, dmPairs } from "../../db/schema/index.js";
import { AppError, dmNotPermitted, notFound } from "../../lib/errors.js";
import { sharesAServer } from "../demo/service.js";
import { canonicalPair, findDmChannelId } from "./queries.js";

const MAX_ATTEMPTS = 3;

class PairAlreadyTaken extends Error {}

async function createDm(me: string, them: string): Promise<string | null> {
  const pair = canonicalPair(me, them);

  try {
    return await db.transaction(async (tx) => {
      const [channel] = await tx
        .insert(channels)
        .values({ serverId: null, type: "dm" })
        .returning({ id: channels.id });

      if (channel === undefined) {
        throw new Error("the DM channel insert returned no row");
      }

      const [claimed] = await tx
        .insert(dmPairs)
        .values({ userA: pair.low, userB: pair.high, channelId: channel.id })
        .onConflictDoNothing({ target: [dmPairs.userA, dmPairs.userB] })
        .returning({ channelId: dmPairs.channelId });

      if (claimed === undefined) {
        throw new PairAlreadyTaken();
      }

      await tx.insert(channelMembers).values([
        { channelId: channel.id, userId: me },
        { channelId: channel.id, userId: them },
      ]);

      return channel.id;
    });
  } catch (error) {
    if (error instanceof PairAlreadyTaken) {
      return null;
    }

    throw error;
  }
}

export interface OpenDmResult {
  created: boolean;
  channelId: string;
}

export interface DmCaller {
  id: string;
  isAnonymous?: boolean | null | undefined;
}

export async function openDm(
  caller: DmCaller,
  them: string,
): Promise<OpenDmResult> {
  const me = caller.id;

  if (me === them) {
    throw new AppError(
      400,
      "CANNOT_DM_SELF",
      "A direct message needs two participants",
    );
  }

  const recipient = await db.query.users.findFirst({
    columns: { id: true, deactivatedAt: true },
    where: { id: them },
  });

  if (recipient?.deactivatedAt !== null) {
    throw notFound("USER_NOT_FOUND", "That user does not exist");
  }

  if (caller.isAnonymous === true && !(await sharesAServer(me, them))) {
    throw dmNotPermitted();
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const existing = await findDmChannelId(me, them);

    if (existing !== undefined) {
      return { created: false, channelId: existing };
    }

    const created = await createDm(me, them);

    if (created !== null) {
      return { created: true, channelId: created };
    }
  }

  throw new Error(
    `A direct message for this pair could not be resolved in ${String(MAX_ATTEMPTS)} attempts`,
  );
}
