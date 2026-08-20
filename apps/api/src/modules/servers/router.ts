import { createServerSchema } from "@opencord/shared/schemas";
import { Router } from "express";

import { validate } from "../../middleware/validate.js";
import { listServersForUser } from "./queries.js";
import { createServer } from "./service.js";

export const serversRouter = Router();

serversRouter.get("/", async (req, res) => {
  res.json(await listServersForUser(req.user.id));
});

serversRouter.post(
  "/",
  validate({ body: createServerSchema }),
  async (req, res) => {
    res.status(201).json(await createServer(req.user.id, req.body));
  },
);
