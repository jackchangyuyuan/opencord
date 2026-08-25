import { createBrowserRouter } from "react-router";

import { RequireSession } from "@/components/layout/require-session";
import { AppRoute } from "@/routes/app";
import { Invite } from "@/routes/invite";
import { Landing } from "@/routes/landing";
import { NotFound } from "@/routes/not-found";

function gated(element: React.ReactElement) {
  return <RequireSession>{element}</RequireSession>;
}

export const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/app", element: gated(<AppRoute />) },
  { path: "/app/channels/:channelId", element: gated(<AppRoute />) },
  { path: "/invite/:code", element: <Invite /> },
  { path: "*", element: <NotFound /> },
]);
