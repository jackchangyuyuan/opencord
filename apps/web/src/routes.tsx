import { createBrowserRouter } from "react-router";

import { ErrorBoundary } from "@/components/layout/error-boundary";
import { RequireSession } from "@/components/layout/require-session";
import { AppRoute } from "@/routes/app";
import { Invite } from "@/routes/invite";
import { Landing } from "@/routes/landing";
import { NotFound } from "@/routes/not-found";
import { SignIn } from "@/routes/sign-in";
import { SignUp } from "@/routes/sign-up";

function boundaried(element: React.ReactElement) {
  return <ErrorBoundary>{element}</ErrorBoundary>;
}

function gated(element: React.ReactElement) {
  return boundaried(<RequireSession>{element}</RequireSession>);
}

export const router = createBrowserRouter([
  { path: "/", element: boundaried(<Landing />) },
  { path: "/app", element: gated(<AppRoute />) },
  { path: "/app/channels/:channelId", element: gated(<AppRoute />) },
  { path: "/app/dms", element: gated(<AppRoute />) },
  { path: "/sign-in", element: boundaried(<SignIn />) },
  { path: "/sign-up", element: boundaried(<SignUp />) },
  { path: "/invite/:code", element: gated(<Invite />) },
  { path: "*", element: <NotFound /> },
]);
