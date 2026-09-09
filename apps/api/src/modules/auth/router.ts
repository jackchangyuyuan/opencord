import { Router } from "express";

import { CONFIGURED_SOCIAL_PROVIDERS } from "../../auth.js";

export const authProvidersRouter = Router();

authProvidersRouter.get("/providers", (_req, res) => {
  res.json({ social: CONFIGURED_SOCIAL_PROVIDERS });
});
