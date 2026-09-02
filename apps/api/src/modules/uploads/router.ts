import { createUploadSchema } from "@opencord/shared/schemas";
import { Router } from "express";

import { uploadRateLimit } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import { authorizeUpload } from "./service.js";

export const uploadsRouter = Router();

uploadsRouter.post(
  "/",
  validate({ body: createUploadSchema }),
  uploadRateLimit,
  async (req, res) => {
    res.status(201).json(await authorizeUpload(req.user.id, req.body));
  },
);
