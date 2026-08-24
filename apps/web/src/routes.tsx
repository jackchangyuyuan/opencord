import { createBrowserRouter } from "react-router";

import { AppRoute } from "@/routes/app";
import { Invite } from "@/routes/invite";
import { Landing } from "@/routes/landing";
import { NotFound } from "@/routes/not-found";

export const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/app", element: <AppRoute /> },
  { path: "/app/channels/:channelId", element: <AppRoute /> },
  { path: "/invite/:code", element: <Invite /> },
  { path: "*", element: <NotFound /> },
]);
