import { queryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export const SOCIAL_PROVIDERS = ["google", "github"] as const;

export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

interface ProvidersResponse {
  social: string[];
}

function isSocialProvider(value: string): value is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

export const socialProvidersQuery = queryOptions({
  queryKey: ["auth", "providers"] as const,
  queryFn: async ({ signal }) => {
    const answer = await api<ProvidersResponse>("/auth/providers", { signal });

    return answer.social.filter(isSocialProvider);
  },
  staleTime: Infinity,
});
