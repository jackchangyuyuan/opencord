import { MENTION_MARKER_PATTERN } from "@opencord/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { Fragment, type ReactNode } from "react";

import { channelQuery } from "@/features/channels/api/queries";
import { serverRolesQuery } from "@/features/roles/api/queries";
import { userQuery } from "@/features/users/api/queries";

function UserName({ id }: { id: string }) {
  const { data } = useQuery(userQuery(id));

  return <>@{data?.name ?? "unknown"}</>;
}

function RoleName({ id, channelId }: { id: string; channelId: string }) {
  const { data: channel } = useQuery(channelQuery(channelId));
  const serverId = channel?.serverId ?? null;

  const { data: roles } = useQuery({
    ...serverRolesQuery(serverId ?? ""),
    enabled: serverId !== null,
  });

  return <>@{roles?.find((role) => role.id === id)?.name ?? "role"}</>;
}

function ChannelName({ id }: { id: string }) {
  const { data } = useQuery(channelQuery(id));

  return <>#{data?.name ?? "channel"}</>;
}

interface Piece {
  key: string;
  node: ReactNode;
}

function pieces(content: string, channelId: string): Piece[] {
  const out: Piece[] = [];
  let cursor = 0;

  for (const match of content.matchAll(MENTION_MARKER_PATTERN)) {
    const start = match.index;

    if (start > cursor) {
      out.push({
        key: `t${String(cursor)}`,
        node: content.slice(cursor, start),
      });
    }

    const prefix = match[1];
    const id = match[2] ?? "";
    const key = `m${String(start)}`;

    out.push({
      key,
      node:
        prefix === undefined ? (
          `@${match[3] ?? ""}`
        ) : prefix === "#" ? (
          <ChannelName id={id} />
        ) : prefix === "@&" ? (
          <RoleName channelId={channelId} id={id} />
        ) : (
          <UserName id={id} />
        ),
    });

    cursor = start + match[0].length;
  }

  if (out.length === 0) {
    return [{ key: "t0", node: content }];
  }

  if (cursor < content.length) {
    out.push({ key: `t${String(cursor)}`, node: content.slice(cursor) });
  }

  return out;
}

export function MentionText({
  channelId,
  content,
}: {
  channelId: string;
  content: string;
}) {
  return (
    <>
      {pieces(content, channelId).map((piece) => (
        <Fragment key={piece.key}>{piece.node}</Fragment>
      ))}
    </>
  );
}
