import { Permissions } from "@opencord/shared/permissions";
import type { RequestHandler } from "express";

import {
  type ChannelContext,
  loadChannelContext,
  loadServerContext,
  type ServerContext,
} from "../access/context.js";
import { forbidden, notFound } from "../lib/errors.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      server: ServerContext;
      channel: ChannelContext;
    }
  }
}

export interface ServerParams {
  serverId: string;
}

export interface ChannelParams {
  channelId: string;
}

export function requireServerPermission(
  required = 0,
): RequestHandler<ServerParams, unknown, unknown, unknown> {
  return async (req, _res, next) => {
    const context = await loadServerContext(req.params.serverId, req.user.id);

    if ((context.permissions & required) !== required) {
      next(forbidden());
      return;
    }

    req.server = context;

    next();
  };
}

function channelGuard(
  required: number,
  serverOnly: boolean,
): RequestHandler<ChannelParams, unknown, unknown, unknown> {
  return async (req, _res, next) => {
    const context = await loadChannelContext(req.params.channelId, req.user.id);

    if (
      context === null ||
      (serverOnly && context.server === null) ||
      (context.permissions & Permissions.VIEW_CHANNEL) === 0
    ) {
      next(notFound("NOT_FOUND", "Channel not found"));
      return;
    }

    if ((context.permissions & required) !== required) {
      next(forbidden());
      return;
    }

    req.channel = context;

    if (context.server !== null) {
      req.server = context.server;
    }

    next();
  };
}

export function requireChannelPermission(
  required = 0,
): RequestHandler<ChannelParams, unknown, unknown, unknown> {
  return channelGuard(required, false);
}

export function requireServerChannel(
  required = 0,
): RequestHandler<ChannelParams, unknown, unknown, unknown> {
  return channelGuard(required, true);
}
