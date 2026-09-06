import "./index.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { Toaster } from "./components/ui/toast";
import { sessionQueryKey } from "./features/auth/hooks/use-session";
import { setSessionExpiredHandler } from "./lib/api-client";
import { queryClient } from "./lib/query-client";
import { router } from "./routes";

setSessionExpiredHandler(() => {
  void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
});

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root is missing in index.html");
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Toaster>
        <RouterProvider router={router} />
        {import.meta.env.PROD ? null : <ReactQueryDevtools />}
      </Toaster>
    </QueryClientProvider>
  </StrictMode>,
);
