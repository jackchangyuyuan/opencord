import { createServer } from "node:http";

import { app } from "./app.js";
import { config } from "./config.js";

const SHUTDOWN_TIMEOUT_MS = 15_000;

const httpServer = createServer(app);

httpServer.listen(config.PORT, () => {
  console.log("API listening on port", config.PORT);
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  console.log("Shutting down on", signal);

  setTimeout(() => {
    console.error("Shutdown timed out after", SHUTDOWN_TIMEOUT_MS, "ms");
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
    console.error("Shutdown failed", error);
    process.exit(1);
  }

  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
