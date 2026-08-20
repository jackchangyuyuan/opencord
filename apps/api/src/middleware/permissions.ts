import type { RequestHandler } from "express";

import { loadServerContext, type ServerContext } from "../access/context.js";
import { forbidden } from "../lib/errors.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      server: ServerContext;
    }
  }
}

export interface ServerParams {
  serverId: string;
}

export function requirePermission(
  bit: number,
): RequestHandler<ServerParams, unknown, unknown, unknown> {
  return async (req, _res, next) => {
    const context = await loadServerContext(req.params.serverId, req.user.id);

    if ((context.permissions & bit) !== bit) {
      next(forbidden());
      return;
    }

    req.server = context;

    next();
  };
}
