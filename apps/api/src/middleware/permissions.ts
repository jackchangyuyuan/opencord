import { Permissions } from "@opencord/shared/permissions";
import type { RequestHandler } from "express";

import {
  type ChannelRow,
  loadServerContext,
  type ServerContext,
} from "../access/context.js";
import { db } from "../db/index.js";
import { forbidden, notFound } from "../lib/errors.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      server: ServerContext;
      channel: ChannelRow;
    }
  }
}

export interface ServerParams {
  serverId: string;
}

export interface ChannelParams {
  channelId: string;
}

export function requirePermission(
  bit = 0,
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

export function requireChannelPermission(
  bit = 0,
): RequestHandler<ChannelParams, unknown, unknown, unknown> {
  return async (req, _res, next) => {
    const channel = await db.query.channels.findFirst({
      where: { id: req.params.channelId },
    });

    if (channel === undefined) {
      next(notFound("NOT_FOUND", "Channel not found"));
      return;
    }

    if (channel.serverId === null) {
      next(notFound("NOT_FOUND", "Channel not found"));
      return;
    }

    const context = await loadServerContext(
      channel.serverId,
      req.user.id,
      channel.id,
    );

    if ((context.permissions & Permissions.VIEW_CHANNEL) === 0) {
      next(notFound("NOT_FOUND", "Channel not found"));
      return;
    }

    if ((context.permissions & bit) !== bit) {
      next(forbidden());
      return;
    }

    req.server = context;
    req.channel = channel;

    next();
  };
}
