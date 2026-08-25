import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api-client";

const UNRETRYABLE = new Set([400, 401, 403, 404, 409, 422]);
const MAX_RETRIES = 2;

export function createQueryClient(): QueryClient {
  return new QueryClient({
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
      mutations: { retry: false },
    },
  });
}

export const queryClient = createQueryClient();
