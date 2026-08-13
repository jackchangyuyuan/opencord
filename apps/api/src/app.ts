import express from "express";

import { httpLogger } from "./middleware/http-logger.js";

export const app = express();

app.use(httpLogger);

app.get("/livez", (_req, res) => {
  res.json({ status: "ok" });
});
