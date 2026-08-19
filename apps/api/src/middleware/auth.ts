import { fromNodeHeaders } from "better-auth/node";
import type { RequestHandler } from "express";

import { auth, isRevoked, type SessionUser } from "../auth.js";
import { unauthorized } from "../lib/errors.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: SessionUser;
    }
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (session === null) {
    next(unauthorized());
    return;
  }

  if (isRevoked(session.user, new Date())) {
    next(unauthorized("SESSION_EXPIRED", "Session expired"));
    return;
  }

  req.user = session.user;

  next();
};
