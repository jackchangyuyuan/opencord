import "./index.css";

import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { Toaster } from "./components/ui/toast";
import { sessionQueryKey } from "./features/auth/hooks/use-session";
import { watchIdentity } from "./features/auth/lib/identity";
import { setSessionExpiredHandler } from "./lib/api-client";
import { queryClient } from "./lib/query-client";
import { router } from "./routes";

setSessionExpiredHandler(() => {
  void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
});

watchIdentity(queryClient);

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root is missing in index.html");
}

// The production Content-Security-Policy is `style-src 'self'`, and the
// `<style>` element a ScrollArea viewport injects to hide the platform
// scrollbar is refused under it -- silently, and only once NGINX is serving the
// headers, so neither the development server nor the suites ever see it. This
// is Base UI's own answer: the element is not rendered, and index.css carries
// the two rules it would have contained.
createRoot(container).render(
  <StrictMode>
    <CSPProvider disableStyleElements>
      <QueryClientProvider client={queryClient}>
        <Toaster>
          <RouterProvider router={router} />
          {import.meta.env.PROD ? null : <ReactQueryDevtools />}
        </Toaster>
      </QueryClientProvider>
    </CSPProvider>
  </StrictMode>,
);
