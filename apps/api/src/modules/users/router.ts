import { updateProfileSchema } from "@opencord/shared/schemas";
import { Router } from "express";
import { z } from "zod";

import { notFound } from "../../lib/errors.js";
import { validate } from "../../middleware/validate.js";
import {
  findUserById,
  findUsersByIds,
  serializeSessionUser,
} from "./queries.js";
import { updateProfile } from "./service.js";

const MAX_USER_IDS = 100;

const usersQuerySchema = z.object({
  ids: z
    .string()
    .transform((value) => value.split(",").filter((id) => id !== ""))
    .pipe(z.array(z.string().min(1).max(64)).min(1).max(MAX_USER_IDS)),
});

export const usersRouter = Router();

usersRouter.get("/@me", async (req, res) => {
  res.json(await serializeSessionUser(req.user));
});

usersRouter.patch(
  "/@me",
  validate({ body: updateProfileSchema }),
  async (req, res) => {
    res.json(await updateProfile(req.user.id, req.body));
  },
);

usersRouter.get(
  "/",
  validate({ query: usersQuerySchema }),
  async (req, res) => {
    res.json(await findUsersByIds(req.query.ids));
  },
);

usersRouter.get("/:userId", async (req, res) => {
  const user = await findUserById(req.params.userId);

  if (user === undefined) {
    throw notFound();
  }

  res.json(user);
});
