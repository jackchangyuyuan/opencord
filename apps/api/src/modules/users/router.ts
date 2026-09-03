import { updateProfileSchema } from "@opencord/shared/schemas";
import { Router } from "express";

import { notFound } from "../../lib/errors.js";
import { validate } from "../../middleware/validate.js";
import { findUserById, serializeUser } from "./queries.js";
import { updateProfile } from "./service.js";

export const usersRouter = Router();

usersRouter.get("/@me", async (req, res) => {
  res.json(await serializeUser(req.user));
});

usersRouter.patch(
  "/@me",
  validate({ body: updateProfileSchema }),
  async (req, res) => {
    res.json(await updateProfile(req.user.id, req.body));
  },
);

usersRouter.get("/:userId", async (req, res) => {
  const user = await findUserById(req.params.userId);

  if (user === undefined) {
    throw notFound();
  }

  res.json(user);
});
