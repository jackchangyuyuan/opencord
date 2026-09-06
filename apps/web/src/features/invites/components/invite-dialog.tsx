import { Permissions } from "@opencord/shared/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  type InviteSummary,
  inviteUrl,
  serverInvitesQuery,
  serverInvitesQueryKey,
} from "@/features/invites/api/queries";
import {
  has,
  useServerPermissions,
} from "@/features/permissions/hooks/use-permissions";
import { api, ApiError } from "@/lib/api-client";

function optional(value: string): number | null {
  const parsed = Number(value);

  return value === "" || Number.isNaN(parsed) ? null : parsed;
}

export function InviteDialog({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const permissions = useServerPermissions(serverId);
  const maxUsesId = useId();
  const expiresId = useId();

  const [open, setOpen] = useState(false);
  const [maxUses, setMaxUses] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const { data } = useQuery({ ...serverInvitesQuery(serverId), enabled: open });

  const create = useMutation({
    meta: { inline: true },
    mutationFn: () =>
      api<InviteSummary>(`/servers/${serverId}/invites`, {
        method: "POST",
        body: {
          maxUses: optional(maxUses),
          expiresInHours: optional(expiresInHours),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: serverInvitesQueryKey(serverId),
      });
    },
  });

  if (!has(permissions, Permissions.CREATE_INVITE)) {
    return null;
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        aria-label="Invite people"
        render={<Button size="icon-xs" variant="ghost" />}
      >
        <Link2 />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>
            Leave both fields empty for a link that never runs out.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-3">
          <Field>
            <FieldLabel htmlFor={maxUsesId}>Maximum uses</FieldLabel>
            <Input
              id={maxUsesId}
              min={1}
              onChange={(event) => {
                setMaxUses(event.target.value);
              }}
              placeholder="Unlimited"
              type="number"
              value={maxUses}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={expiresId}>Expires in (hours)</FieldLabel>
            <Input
              id={expiresId}
              min={1}
              onChange={(event) => {
                setExpiresInHours(event.target.value);
              }}
              placeholder="Never"
              type="number"
              value={expiresInHours}
            />
          </Field>
        </div>

        {create.error === null ? null : (
          <p className="text-sm text-destructive" role="alert">
            {create.error instanceof ApiError
              ? create.error.message
              : "Could not create the invite"}
          </p>
        )}

        <Button
          disabled={create.isPending}
          onClick={() => {
            create.mutate();
          }}
          size="sm"
        >
          {create.isPending ? "Creating…" : "Create invite"}
        </Button>

        <ul className="flex flex-col gap-1">
          {(data ?? []).map((invite) => (
            <li className="flex items-center gap-2" key={invite.code}>
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {inviteUrl(invite.code)}
              </span>
              <span className="text-xs text-muted-foreground">
                {invite.maxUses === null
                  ? `${String(invite.uses)} uses`
                  : `${String(invite.uses)}/${String(invite.maxUses)}`}
              </span>
              <Button
                onClick={() => {
                  void navigator.clipboard
                    .writeText(inviteUrl(invite.code))
                    .then(() => {
                      setCopied(invite.code);
                    });
                }}
                size="xs"
                variant="outline"
              >
                {copied === invite.code ? "Copied" : "Copy link"}
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
