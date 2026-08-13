import { sql } from "drizzle-orm";
import express from "express";

import { db } from "./db/index.js";
import { notFound } from "./lib/errors.js";
import { errorHandler } from "./middleware/error.js";
import { httpLogger } from "./middleware/http-logger.js";

export const app = express();

app.use(httpLogger);

app.get("/livez", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/readyz", async (req, res) => {
  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    req.log.error({ err: error }, "Readiness check failed");
    res.status(503).json({ postgres: "error" });
    return;
  }

  res.json({ postgres: "ok" });
});

const apiRouter = express.Router();

app.use("/api/v1", apiRouter);

app.use((_req, _res, next) => {
  next(notFound());
});

app.use(errorHandler);
