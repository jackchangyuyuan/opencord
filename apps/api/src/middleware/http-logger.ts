import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { pinoHttp } from "pino-http";

import { logger } from "../lib/logger.js";

export const httpLogger = pinoHttp({
  logger,
  quietReqLogger: true,
  genReqId: (_req: IncomingMessage, res: ServerResponse) => {
    const id = randomUUID();

    res.setHeader("x-request-id", id);

    return id;
  },
});
