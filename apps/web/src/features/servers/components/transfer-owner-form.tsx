import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { serverMembersQuery } from "@/features/members/api/queries";
import { serversQueryKey } from "@/features/servers/api/queries";
import { api, ApiError } from "@/lib/api-client";

export function TransferOwnerForm({
  autoOpen = false,
  currentOwnerId,
  serverId,
}: {
  autoOpen?: boolean;
  currentOwnerId: string;
  serverId: string;
}) {
  const queryClient = useQueryClient();
  const selectId = useId();
  const [open, setOpen] = useState(autoOpen);
  const [userId, setUserId] = useState("");
  const [confirming, setConfirming] = useState(false);

  const { data } = useInfiniteQuery({
    ...serverMembersQuery(serverId),
    enabled: open,
  });

  const candidates = (data?.pages ?? [])
    .flatMap((page) => page.data)
    .filter((entry) => entry.user.id !== currentOwnerId);

  const labels = Object.fromEntries(
    candidates.map((entry) => [entry.user.id, entry.user.name]),
  );

  const transfer = useMutation({
    meta: { inline: true },
    mutationFn: (target: string) =>
      api<unknown>(`/servers/${serverId}/owner`, {
        method: "POST",
        body: { userId: target },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: serversQueryKey });
      setConfirming(false);
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <Button
        className="w-fit"
        onClick={() => {
          setOpen(true);
        }}
        size="sm"
        variant="outline"
      >
        Transfer ownership
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          onValueChange={(next: string | null) => {
            setUserId(next ?? "");
            setConfirming(false);
          }}
          value={userId}
        >
          <SelectTrigger
            aria-label="Transfer ownership to"
            className="w-56"
            id={selectId}
          >
            <SelectValue>
              {(value: string | null) =>
                value === null || value === ""
                  ? "Choose a member"
                  : (labels[value] ?? "Choose a member")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {candidates.map((entry) => (
              <SelectItem key={entry.user.id} value={entry.user.id}>
                {entry.user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {confirming ? (
          <>
            <Button
              disabled={transfer.isPending}
              onClick={() => {
                transfer.mutate(userId);
              }}
              size="sm"
              variant="destructive"
            >
              {transfer.isPending ? "Transferring…" : "Confirm"}
            </Button>
            <Button
              onClick={() => {
                setConfirming(false);
              }}
              size="sm"
              variant="outline"
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              disabled={userId === ""}
              onClick={() => {
                setConfirming(true);
              }}
              size="sm"
              variant="outline"
            >
              Transfer
            </Button>
            {autoOpen ? null : (
              <Button
                onClick={() => {
                  setOpen(false);
                  setUserId("");
                }}
                size="sm"
                variant="ghost"
              >
                Cancel
              </Button>
            )}
          </>
        )}
      </div>

      {confirming ? (
        <p className="text-xs text-muted-foreground">
          {labels[userId] ?? "That member"} becomes the owner. You keep your
          roles, and this cannot be undone.
        </p>
      ) : null}

      {transfer.error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {transfer.error instanceof ApiError
            ? transfer.error.message
            : "Could not transfer the server"}
        </p>
      )}
    </div>
  );
}
