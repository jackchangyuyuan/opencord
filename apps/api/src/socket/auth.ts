import type { IncomingHttpHeaders } from "node:http";

import { fromNodeHeaders } from "better-auth/node";

import { auth, isRevoked, type SessionUser } from "../auth.js";
import { logger } from "../lib/logger.js";
import type { SocketServer } from "./types.js";

export const REVALIDATION_INTERVAL_MS = 5 * 60 * 1000;

export interface ResolvedSession {
  user: SessionUser;
  sessionId: string;
}

async function resolveSession(
  headers: IncomingHttpHeaders,
): Promise<ResolvedSession | null> {
  const resolved = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
    query: { disableRefresh: true },
  });

  if (resolved === null || isRevoked(resolved.user, new Date())) {
    return null;
  }

  return { user: resolved.user, sessionId: resolved.session.id };
}

export function authenticateSockets(io: SocketServer): void {
  io.use((socket, next) => {
    resolveSession(socket.handshake.headers).then(
      (session) => {
        if (session === null) {
          next(new Error("Unauthorized"));
          return;
        }

        socket.data.user = session.user;
        socket.data.sessionId = session.sessionId;
        next();
      },
      (error: unknown) => {
        logger.error({ err: error }, "Socket authentication failed");
        next(new Error("Unauthorized"));
      },
    );
  });
}

export async function revalidateSessions(io: SocketServer): Promise<void> {
  const live = new Map<string, boolean>();

  for (const socket of [...io.of("/").sockets.values()]) {
    const { sessionId } = socket.data;
    let valid = live.get(sessionId);

    if (valid === undefined) {
      const session = await resolveSession(socket.handshake.headers);

      valid = session?.sessionId === sessionId;
      live.set(sessionId, valid);
    }

    if (!valid) {
      socket.disconnect(true);
    }
  }
}
