import { createServer } from "node:http";

import { app } from "./app.js";
import { config } from "./config.js";
import { db } from "./db/index.js";
import { startJobRunner } from "./jobs/index.js";
import { logger } from "./lib/logger.js";
import { assertStorageOrigin } from "./lib/storage.js";
import { redis } from "./redis.js";
import { createSocketServer, type SocketService } from "./socket/index.js";

const SHUTDOWN_TIMEOUT_MS = 15_000;

const httpServer = createServer(app);

let sockets: SocketService;

try {
  sockets = await createSocketServer(httpServer);
} catch (error) {
  logger.error({ err: error }, "Socket server could not reach Redis");
  process.exit(1);
}

try {
  await assertStorageOrigin();
} catch (error) {
  logger.error({ err: error }, "Storage origin assertion failed");
  process.exit(1);
}

const jobRunner = startJobRunner();

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
    const drained = new Promise<void>((resolve) => {
      httpServer.close(() => {
        resolve();
      });
    });

    sockets.io.local.emit("system:reconnect");

    await sockets.close();
    await drained;
    await jobRunner.stop();
    await db.$client.end();
    await redis.quit();
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
