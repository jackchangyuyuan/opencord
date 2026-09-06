import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { api, ApiError } from "@/lib/api-client";

export interface DemoScenario {
  userId: string;
  serverCount: number;
  sandboxId: string;
  landingChannelId: string | null;
}

export function useEnterDemo() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    meta: { inline: true },
    mutationFn: () => api<DemoScenario>("/demo/guest", { method: "POST" }),
    onSuccess: async (scenario) => {
      queryClient.clear();

      await navigate(
        scenario.landingChannelId === null
          ? "/app"
          : `/app/channels/${scenario.landingChannelId}`,
      );
    },
  });

  return {
    enterDemo: () => {
      mutation.mutate();
    },
    isPending: mutation.isPending,
    error:
      mutation.error === null
        ? null
        : mutation.error instanceof ApiError
          ? mutation.error.message
          : "The demo could not be started",
  };
}
