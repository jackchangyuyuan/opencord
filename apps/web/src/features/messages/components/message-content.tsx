import { useQuery } from "@tanstack/react-query";
import {
  type ComponentPropsWithoutRef,
  createContext,
  type ReactNode,
  use,
} from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { channelQuery } from "@/features/channels/api/queries";
import {
  MENTION_ID_ATTRIBUTE,
  MENTION_KIND_ATTRIBUTE,
  type MentionKind,
  rehypeMentions,
} from "@/features/messages/lib/render-mentions";
import { sanitizeSchema } from "@/features/messages/lib/sanitize-schema";
import { serverRolesQuery } from "@/features/roles/api/queries";
import { userQuery } from "@/features/users/api/queries";

const CHIP =
  "rounded bg-primary/10 px-1 font-medium text-primary hover:bg-primary/20";

const MessageChannelContext = createContext<string | null>(null);

function UserChip({ id, fallback }: { id: string; fallback: ReactNode }) {
  const { data } = useQuery(userQuery(id));

  return data === undefined ? (
    <span>{fallback}</span>
  ) : (
    <span className={CHIP}>@{data.username}</span>
  );
}

function ChannelChip({ id, fallback }: { id: string; fallback: ReactNode }) {
  const { data } = useQuery(channelQuery(id));

  return data?.name == null ? (
    <span>{fallback}</span>
  ) : (
    <span className={CHIP}>#{data.name}</span>
  );
}

function RoleChip({ id, fallback }: { id: string; fallback: ReactNode }) {
  const channelId = use(MessageChannelContext);

  const { data: channel } = useQuery({
    ...channelQuery(channelId ?? ""),
    enabled: channelId !== null,
  });

  const serverId = channel?.serverId ?? null;

  const { data: roles } = useQuery({
    ...serverRolesQuery(serverId ?? ""),
    enabled: serverId !== null,
  });

  const role = roles?.find((candidate) => candidate.id === id);

  return role === undefined ? (
    <span>{fallback}</span>
  ) : (
    <span className={CHIP}>@{role.name}</span>
  );
}

function isMentionKind(value: unknown): value is MentionKind {
  return value === "user" || value === "role" || value === "channel";
}

function MentionSpan(props: ComponentPropsWithoutRef<"span">) {
  const attributes = props as Record<string, unknown>;
  const kind = attributes[MENTION_KIND_ATTRIBUTE];
  const id = attributes[MENTION_ID_ATTRIBUTE];

  if (!isMentionKind(kind) || typeof id !== "string") {
    return <span {...props} />;
  }

  if (kind === "channel") {
    return <ChannelChip fallback={props.children} id={id} />;
  }

  if (kind === "role") {
    return <RoleChip fallback={props.children} id={id} />;
  }

  return <UserChip fallback={props.children} id={id} />;
}

export function MessageContent({
  channelId,
  content,
}: {
  channelId: string;
  content: string;
}) {
  return (
    <div
      className="message-markdown text-sm break-words"
      data-testid="message-content"
    >
      <MessageChannelContext value={channelId}>
        <Markdown
          components={{ span: MentionSpan }}
          rehypePlugins={[
            [rehypeSanitize, sanitizeSchema],
            rehypeMentions,
            rehypeHighlight,
          ]}
          remarkPlugins={[remarkGfm]}
        >
          {content}
        </Markdown>
      </MessageChannelContext>
    </div>
  );
}
