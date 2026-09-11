import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { CenteredPanel } from "@/components/layout/centered-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { serverChannelsQuery } from "@/features/channels/api/queries";
import { invitePreviewQuery } from "@/features/invites/api/queries";
import { serversQueryKey } from "@/features/servers/api/queries";
import { api, ApiError } from "@/lib/api-client";
import { tintHue } from "@/lib/tint";

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
    meta: { inline: true },
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

  if (preview.isPending) {
    return (
      <CenteredPanel
        description="One moment while the server this points at is looked up."
        title="Opening that invite…"
      >
        <div aria-hidden className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </CenteredPanel>
    );
  }

  if (preview.isError) {
    return (
      <CenteredPanel
        description={failure(preview.error).body}
        footer={
          <Link className="text-foreground underline underline-offset-4" to="/">
            Back to the landing page
          </Link>
        }
        title={failure(preview.error).title}
      />
    );
  }

  const members = preview.data.memberCount;

  return (
    <CenteredPanel
      description="You have been invited to join this server."
      title="An invitation"
    >
      <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
        <span
          className="server-tint flex size-10 shrink-0 items-center justify-center rounded-xl text-body font-semibold"
          style={
            {
              "--tint-hue": tintHue(preview.data.server.id),
            } as CSSProperties
          }
        >
          {preview.data.server.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {preview.data.server.name}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-presence-online" />
            {members === 1 ? "1 member" : `${String(members)} members`}
          </p>
        </div>
      </div>

      {redeem.error === null ? null : (
        <div
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3"
          role="alert"
        >
          <p className="text-body font-medium text-destructive">
            {failure(redeem.error).title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {failure(redeem.error).body}
          </p>
        </div>
      )}

      <Button
        className="mt-4 w-full"
        disabled={redeem.isPending}
        onClick={() => {
          redeem.mutate();
        }}
        size="lg"
      >
        {redeem.isPending ? "Joining…" : "Accept invite"}
      </Button>
    </CenteredPanel>
  );
}
