import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";

import { Button } from "@/components/ui/button";
import { serverChannelsQuery } from "@/features/channels/api/queries";
import { invitePreviewQuery } from "@/features/invites/api/queries";
import { serversQueryKey } from "@/features/servers/api/queries";
import { api, ApiError } from "@/lib/api-client";

const COPY: Record<string, { title: string; body: string }> = {
  USER_BANNED: {
    title: "You cannot join this server",
    body: "You are banned from it. Ask a moderator to lift the ban.",
  },
  INVITE_EXHAUSTED: {
    title: "This invite is no longer usable",
    body: "It has run out of uses or expired. Ask for a fresh link.",
  },
  INVITE_NOT_FOUND: {
    title: "That invite does not exist",
    body: "Check the link, or ask whoever sent it for a new one.",
  },
};

function failure(error: unknown): { title: string; body: string } {
  const code = error instanceof ApiError ? error.code : "";

  return (
    COPY[code] ?? {
      title: "Could not join",
      body: "Something went wrong. Try again in a moment.",
    }
  );
}

export function InviteLanding() {
  const { code = "" } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const preview = useQuery(invitePreviewQuery(code));

  const redeem = useMutation({
    mutationFn: () =>
      api<{ serverId: string }>(`/invites/${code}`, { method: "POST" }),
    onSuccess: async ({ serverId }) => {
      await queryClient.invalidateQueries({ queryKey: serversQueryKey });

      const channels = await queryClient.query({
        ...serverChannelsQuery(serverId),
        staleTime: "static",
      });

      const [first] = channels;

      await navigate(
        first === undefined ? "/app" : `/app/channels/${first.id}`,
      );
    },
  });

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      {preview.isPending ? (
        <p className="text-muted-foreground">Looking up that invite…</p>
      ) : preview.isError ? (
        <>
          <h1 className="text-2xl font-semibold">
            {failure(preview.error).title}
          </h1>
          <p className="text-muted-foreground">{failure(preview.error).body}</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">{preview.data.server.name}</h1>
          <p className="text-muted-foreground">
            {preview.data.memberCount === 1
              ? "1 member"
              : `${String(preview.data.memberCount)} members`}
          </p>

          {redeem.error === null ? null : (
            <div className="max-w-sm" role="alert">
              <p className="font-medium">{failure(redeem.error).title}</p>
              <p className="text-sm text-muted-foreground">
                {failure(redeem.error).body}
              </p>
            </div>
          )}

          <Button
            disabled={redeem.isPending}
            onClick={() => {
              redeem.mutate();
            }}
          >
            {redeem.isPending ? "Joining…" : "Accept invite"}
          </Button>
        </>
      )}
    </main>
  );
}
