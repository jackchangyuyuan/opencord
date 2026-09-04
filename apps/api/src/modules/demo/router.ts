import { claimAccountSchema } from "@opencord/shared/schemas";
import { fromNodeHeaders } from "better-auth/node";
import { Router } from "express";

import {
  demoClaimRateLimit,
  demoDailyRateLimit,
  demoGuestRateLimit,
} from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import {
  claimAccount,
  createGuestSession,
  provisionDemoScenario,
} from "./service.js";

export const demoRouter = Router();

demoRouter.post(
  "/guest",
  demoGuestRateLimit,
  demoDailyRateLimit,
  async (req, res) => {
    const guest = await createGuestSession(fromNodeHeaders(req.headers));

    res.append("set-cookie", guest.setCookie);

    res.status(201).json(await provisionDemoScenario(guest.userId));
  },
);

export const demoClaimRouter = Router();

demoClaimRouter.post(
  "/claim",
  validate({ body: claimAccountSchema }),
  demoClaimRateLimit,
  async (req, res) => {
    res.json(
      await claimAccount(req.user, fromNodeHeaders(req.headers), req.body),
    );
  },
);
