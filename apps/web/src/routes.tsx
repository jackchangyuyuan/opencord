import { createBrowserRouter } from "react-router";

import { RequireSession } from "@/components/layout/require-session";
import { AppRoute } from "@/routes/app";
import { Invite } from "@/routes/invite";
import { Landing } from "@/routes/landing";
import { NotFound } from "@/routes/not-found";
import { SignIn } from "@/routes/sign-in";
import { SignUp } from "@/routes/sign-up";

function gated(element: React.ReactElement) {
  return <RequireSession>{element}</RequireSession>;
}

export const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/app", element: gated(<AppRoute />) },
  { path: "/app/channels/:channelId", element: gated(<AppRoute />) },
  { path: "/app/dms", element: gated(<AppRoute />) },
  { path: "/sign-in", element: <SignIn /> },
  { path: "/sign-up", element: <SignUp /> },
  { path: "/invite/:code", element: gated(<Invite />) },
  { path: "*", element: <NotFound /> },
]);
