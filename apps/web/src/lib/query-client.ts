import { MutationCache, QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api-client";
import { toastError } from "@/lib/toast";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { inline?: boolean };
  }
}

const UNRETRYABLE = new Set([400, 401, 403, 404, 409, 422]);
const MAX_RETRIES = 2;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.inline === true) {
          return;
        }

        toastError(error);
      },
    }),
    defaultOptions: {
      queries: {
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && UNRETRYABLE.has(error.status)) {
            return false;
          }

          return failureCount < MAX_RETRIES;
        },
      },
      // Deliberately asymmetric. POST /servers, /channels, /roles and /invites carry
      // no nonce, so an automatic retry after an ambiguous failure could create a
      // duplicate. Message send is the exception: it retries on the same nonce, which
      // the server's partial unique index makes safe, from its own hook rather than
      // here.
      mutations: { retry: false },
    },
  });
}

export const queryClient = createQueryClient();
