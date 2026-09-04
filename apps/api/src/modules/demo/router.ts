import { fromNodeHeaders } from "better-auth/node";
import { Router } from "express";

import {
  demoDailyRateLimit,
  demoGuestRateLimit,
} from "../../middleware/rate-limit.js";
import { createGuestSession, provisionDemoScenario } from "./service.js";

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
