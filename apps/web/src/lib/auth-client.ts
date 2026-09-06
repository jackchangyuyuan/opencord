import {
  anonymousClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [
    anonymousClient(),
    inferAdditionalFields({
      user: {
        username: { type: "string" },
        guestExpiresAt: { type: "date", required: false },
      },
    }),
  ],
});

export type Session = typeof authClient.$Infer.Session;
export type SessionUser = Session["user"];
