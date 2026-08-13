import express from "express";

import { notFound } from "./lib/errors.js";
import { errorHandler } from "./middleware/error.js";
import { httpLogger } from "./middleware/http-logger.js";

export const app = express();

app.use(httpLogger);

app.get("/livez", (_req, res) => {
  res.json({ status: "ok" });
});

const apiRouter = express.Router();

app.use("/api/v1", apiRouter);

app.use((_req, _res, next) => {
  next(notFound());
});

app.use(errorHandler);
