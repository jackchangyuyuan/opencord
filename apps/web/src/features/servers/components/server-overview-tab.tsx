import { zodResolver } from "@hookform/resolvers/zod";
import { Permissions } from "@opencord/shared/permissions";
import {
  type UpdateServerInput,
  updateServerSchema,
} from "@opencord/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  has,
  useServerPermissions,
} from "@/features/permissions/hooks/use-permissions";
import {
  serverQueryKey,
  serversQueryKey,
  type ServerSummary,
} from "@/features/servers/api/queries";
import { TransferOwnerForm } from "@/features/servers/components/transfer-owner-form";
import { currentUserQuery } from "@/features/users/api/queries";
import { AvatarPicker } from "@/features/users/components/avatar-picker";
import { api, ApiError } from "@/lib/api-client";

const OWNER_MUST_TRANSFER = "OWNER_MUST_TRANSFER";

export function ServerOverviewTab({
  onDone,
  server,
}: {
  onDone: () => void;
  server: ServerSummary;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const permissions = useServerPermissions(server.id);
  const { data: me } = useQuery(currentUserQuery);

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const form = useForm<UpdateServerInput>({
    resolver: zodResolver(updateServerSchema),
    defaultValues: { name: server.name },
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: serversQueryKey });
    await queryClient.invalidateQueries({
      queryKey: serverQueryKey(server.id),
    });
  };

  const rename = useMutation({
    mutationFn: (input: UpdateServerInput) =>
      api<unknown>(`/servers/${server.id}`, { method: "PATCH", body: input }),
    onSuccess: refresh,
  });

  const leave = useMutation({
    meta: { inline: true },
    mutationFn: () =>
      api<unknown>(`/servers/${server.id}/members/@me`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      onDone();
      await navigate("/app");
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      api<unknown>(`/servers/${server.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      onDone();
      await navigate("/app");
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    rename.mutate(values);
  });

  const mustTransfer =
    leave.error instanceof ApiError && leave.error.code === OWNER_MUST_TRANSFER;

  const mayManage = has(permissions, Permissions.MANAGE_SERVER);
  const isOwner = me?.id === server.ownerId;

  return (
    <div className="flex flex-col gap-5">
      {mayManage ? (
        <AvatarPicker
          currentUrl={server.iconUrl}
          fallback={server.name.slice(0, 2).toUpperCase()}
          kind="icon"
          label="Choose an icon"
          onPicked={(iconObjectKey) => {
            rename.mutate({ iconObjectKey });
          }}
        />
      ) : null}

      {mayManage ? (
        <form noValidate onSubmit={(event) => void onSubmit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="server-settings-name">
                Server name
              </FieldLabel>
              <Input
                aria-invalid={form.formState.errors.name !== undefined}
                autoComplete="off"
                id="server-settings-name"
                {...form.register("name")}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>
            <Button disabled={rename.isPending} size="sm" type="submit">
              {rename.isPending ? "Saving…" : "Save"}
            </Button>
          </FieldGroup>
        </form>
      ) : null}

      {isOwner ? (
        <TransferOwnerForm
          currentOwnerId={server.ownerId}
          serverId={server.id}
        />
      ) : null}

      <div className="flex flex-col gap-2 border-t pt-4">
        <Button
          disabled={leave.isPending}
          onClick={() => {
            leave.mutate();
          }}
          size="sm"
          variant="outline"
        >
          {leave.isPending ? "Leaving…" : "Leave server"}
        </Button>

        {mustTransfer ? (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
            <p className="text-sm" role="alert">
              You own this server. Hand it to another member before you leave.
            </p>
            <TransferOwnerForm
              currentOwnerId={server.ownerId}
              serverId={server.id}
            />
          </div>
        ) : leave.error === null ? null : (
          <p className="text-sm text-destructive" role="alert">
            {leave.error instanceof ApiError
              ? leave.error.message
              : "Could not leave the server"}
          </p>
        )}

        {isOwner ? (
          confirmingDelete ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm text-muted-foreground">
                Deleting removes every channel and message.
              </p>
              <Button
                onClick={() => {
                  setConfirmingDelete(false);
                }}
                size="sm"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate();
                }}
                size="sm"
                variant="destructive"
              >
                {remove.isPending ? "Deleting…" : "Delete for good"}
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => {
                setConfirmingDelete(true);
              }}
              size="sm"
              variant="destructive"
            >
              Delete server
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}
