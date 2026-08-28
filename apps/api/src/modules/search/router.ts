import { Router } from "express";
import { z } from "zod";

import { resolveAccessibleChannels } from "../../access/channels.js";
import { validate } from "../../middleware/validate.js";
import { SEARCH_MAX_LIMIT, searchMessages } from "./queries.js";

const searchQuerySchema = z.object({
  q: z.string().max(256).default(""),
  server_id: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(SEARCH_MAX_LIMIT).default(25),
  offset: z.coerce.number().int().min(0).max(1_000).default(0),
});

export const searchRouter = Router();

searchRouter.get(
  "/",
  validate({ query: searchQuerySchema }),
  async (req, res) => {
    const accessible = await resolveAccessibleChannels(req.user.id);

    res.json(
      await searchMessages({
        raw: req.query.q,
        accessibleChannelIds: [...accessible],
        ...(req.query.server_id === undefined
          ? {}
          : { serverId: req.query.server_id }),
        limit: req.query.limit,
        offset: req.query.offset,
      }),
    );
  },
);
