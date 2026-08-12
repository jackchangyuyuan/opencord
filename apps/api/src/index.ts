import { createServer } from "node:http";

import { app } from "./app.js";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";

const SHUTDOWN_TIMEOUT_MS = 15_000;

const httpServer = createServer(app);

httpServer.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "API listening");
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info({ signal }, "Shutting down");

  setTimeout(() => {
    logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, "Shutdown timed out");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
      httpServer.closeIdleConnections();
    });
  } catch (error) {
    logger.error({ err: error }, "Shutdown failed");
    process.exit(1);
  }

  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
