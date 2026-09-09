import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { pinoHttp, stdSerializers } from "pino-http";

import { logger, REDACTED } from "../lib/logger.js";

const SECRET_PARAMS = new Set(["code", "state", "token"]);

export function redactQuery(url: string): string {
  const separator = url.indexOf("?");

  if (separator === -1) {
    return url;
  }

  const params = new URLSearchParams(url.slice(separator + 1));
  const secrets = [...params.keys()].filter((name) => SECRET_PARAMS.has(name));

  for (const name of secrets) {
    params.set(name, REDACTED);
  }

  return `${url.slice(0, separator)}?${params.toString()}`;
}

export function serializeRequest(req: IncomingMessage) {
  const serialized = stdSerializers.req(req);

  return { ...serialized, url: redactQuery(serialized.url) };
}

export const httpLogger = pinoHttp({
  logger,
  quietReqLogger: true,
  serializers: { req: serializeRequest },
  genReqId: (_req: IncomingMessage, res: ServerResponse) => {
    const id = randomUUID();

    res.setHeader("x-request-id", id);

    return id;
  },
});
