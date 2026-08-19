import { Router } from "express";

import { notFound } from "../../lib/errors.js";
import { findUserById, serializeUser } from "./queries.js";

export const usersRouter = Router();

usersRouter.get("/@me", (req, res) => {
  res.json(serializeUser(req.user));
});

usersRouter.get("/:userId", async (req, res) => {
  const user = await findUserById(req.params.userId);

  if (user === undefined) {
    throw notFound();
  }

  res.json(user);
});
