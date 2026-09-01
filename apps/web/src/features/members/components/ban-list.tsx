import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { serverBansQuery } from "@/features/members/api/queries";
import { useMemberMutations } from "@/features/members/hooks/use-member-mutations";

export function BanList({ serverId }: { serverId: string }) {
  const mutations = useMemberMutations(serverId);
  const { data, isPending, isError } = useQuery(serverBansQuery(serverId));

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading bans…</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground" role="alert">
        Could not load the bans.
      </p>
    );
  }

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Nobody is banned.</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {data.map((entry) => (
        <li className="flex items-center gap-3" key={entry.user.id}>
          <span className="min-w-0 flex-1 truncate text-sm">
            {entry.user.name}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {entry.reason ?? "No reason given"}
          </span>
          <Button
            disabled={mutations.isPending}
            onClick={() => {
              mutations.unban(entry.user.id);
            }}
            size="xs"
            variant="outline"
          >
            Unban
          </Button>
        </li>
      ))}
    </ul>
  );
}
