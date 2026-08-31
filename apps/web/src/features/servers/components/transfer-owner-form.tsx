import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { serverMembersQuery } from "@/features/members/api/queries";
import { serversQueryKey } from "@/features/servers/api/queries";
import { api } from "@/lib/api-client";

export function TransferOwnerForm({
  currentOwnerId,
  serverId,
}: {
  currentOwnerId: string;
  serverId: string;
}) {
  const queryClient = useQueryClient();
  const selectId = useId();
  const [userId, setUserId] = useState("");
  const [confirming, setConfirming] = useState(false);

  const { data } = useInfiniteQuery(serverMembersQuery(serverId));

  const candidates = (data?.pages ?? [])
    .flatMap((page) => page.data)
    .filter((entry) => entry.user.id !== currentOwnerId);

  const transfer = useMutation({
    mutationFn: (target: string) =>
      api<unknown>(`/servers/${serverId}/owner`, {
        method: "POST",
        body: { userId: target },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: serversQueryKey });
      setConfirming(false);
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <Field>
        <FieldLabel htmlFor={selectId}>Transfer ownership to</FieldLabel>
        <select
          className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
          id={selectId}
          onChange={(event) => {
            setUserId(event.target.value);
            setConfirming(false);
          }}
          value={userId}
        >
          <option value="">Choose a member</option>
          {candidates.map((entry) => (
            <option key={entry.user.id} value={entry.user.id}>
              {entry.user.name}
            </option>
          ))}
        </select>
      </Field>

      {confirming ? (
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm text-muted-foreground">
            This cannot be undone.
          </p>
          <Button
            onClick={() => {
              setConfirming(false);
            }}
            size="sm"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            disabled={transfer.isPending}
            onClick={() => {
              transfer.mutate(userId);
            }}
            size="sm"
            variant="destructive"
          >
            {transfer.isPending ? "Transferring…" : "Confirm transfer"}
          </Button>
        </div>
      ) : (
        <Button
          disabled={userId === ""}
          onClick={() => {
            setConfirming(true);
          }}
          size="sm"
          variant="outline"
        >
          Transfer ownership
        </Button>
      )}
    </div>
  );
}
