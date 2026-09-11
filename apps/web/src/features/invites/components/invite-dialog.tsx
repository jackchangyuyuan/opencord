import { Permissions } from "@opencord/shared/permissions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type InviteSummary,
  inviteUrl,
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
  const [copied, setCopied] = useState(false);

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
      setCopied(false);
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
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              aria-label="Invite people"
              render={
                <Button
                  className="text-muted-foreground"
                  size="icon-sm"
                  variant="ghost"
                />
              }
            />
          }
        >
          <Link2 />
        </TooltipTrigger>
        <TooltipContent side="bottom">Invite people</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription className="sr-only">
            Create an invite link for this server.
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

        {create.data === undefined ? null : (
          <div className="flex items-center gap-2 rounded-lg border p-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">
              {inviteUrl(create.data.code)}
            </span>
            <Button
              onClick={() => {
                void navigator.clipboard
                  .writeText(inviteUrl(create.data.code))
                  .then(() => {
                    setCopied(true);
                  });
              }}
              size="xs"
              variant="outline"
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Every open invite is listed in Server settings → Invites.
        </p>
      </DialogContent>
    </Dialog>
  );
}
