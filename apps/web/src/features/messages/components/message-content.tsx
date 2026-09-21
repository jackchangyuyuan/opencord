import { useQuery } from "@tanstack/react-query";
import { type ComponentPropsWithoutRef, createContext, memo, use } from "react";
import Markdown, { type Options } from "react-markdown";
import { useNavigate } from "react-router";
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
  "rounded-md bg-primary/10 px-1 py-px font-medium text-primary hover:bg-primary/20";

const CHANNEL_CHIP =
  "rounded-md bg-primary/10 px-1 py-px font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:bg-primary/20 hover:decoration-primary focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none";

const BROADCAST_CHIP =
  "rounded-md bg-brand px-1.5 py-px font-semibold text-brand-foreground";

const MessageChannelContext = createContext<string | null>(null);

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [
  [rehypeSanitize, sanitizeSchema],
  rehypeMentions,
] satisfies Options["rehypePlugins"];
const REHYPE_PLUGINS_WITH_CODE = [
  ...REHYPE_PLUGINS,
  rehypeHighlight,
] satisfies Options["rehypePlugins"];

const CODE_FENCE = "```";

const UNKNOWN_USER = "@unknown-user";
const UNKNOWN_ROLE = "@unknown-role";
const UNKNOWN_CHANNEL = "#unknown-channel";

function UserChip({ id }: { id: string }) {
  const { data } = useQuery(userQuery(id));

  return data === undefined ? (
    <span className={CHIP}>{UNKNOWN_USER}</span>
  ) : (
    <span className={CHIP} title={`@${data.username}`}>
      @{data.name}
    </span>
  );
}

function BroadcastChip({ token }: { token: string }) {
  const channelId = use(MessageChannelContext);

  const { data: channel } = useQuery({
    ...channelQuery(channelId ?? ""),
    enabled: channelId !== null,
  });

  return channel?.serverId == null ? (
    <span>@{token}</span>
  ) : (
    <span className={BROADCAST_CHIP}>@{token}</span>
  );
}

function ChannelChip({ id }: { id: string }) {
  const navigate = useNavigate();
  const { data } = useQuery(channelQuery(id));

  if (data?.name == null) {
    return <span className={CHIP}>{UNKNOWN_CHANNEL}</span>;
  }

  return (
    <button
      className={CHANNEL_CHIP}
      onClick={() => {
        void navigate(`/app/channels/${id}`);
      }}
      type="button"
    >
      #{data.name}
    </button>
  );
}

function RoleChip({ id }: { id: string }) {
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
    <span className={BROADCAST_CHIP}>{UNKNOWN_ROLE}</span>
  ) : (
    <span className={BROADCAST_CHIP}>@{role.name}</span>
  );
}

const MARKDOWN_COMPONENTS: Options["components"] = { span: MentionSpan };

function isMentionKind(value: unknown): value is MentionKind {
  return (
    value === "user" ||
    value === "role" ||
    value === "channel" ||
    value === "broadcast"
  );
}

function MentionSpan(props: ComponentPropsWithoutRef<"span">) {
  const attributes = props as Record<string, unknown>;
  const kind = attributes[MENTION_KIND_ATTRIBUTE];
  const id = attributes[MENTION_ID_ATTRIBUTE];

  if (!isMentionKind(kind) || typeof id !== "string") {
    return <span {...props} />;
  }

  if (kind === "broadcast") {
    return <BroadcastChip token={id} />;
  }

  if (kind === "channel") {
    return <ChannelChip id={id} />;
  }

  if (kind === "role") {
    return <RoleChip id={id} />;
  }

  return <UserChip id={id} />;
}

export const MessageContent = memo(function MessageContent({
  channelId,
  content,
  edited = false,
}: {
  channelId: string;
  content: string;
  edited?: boolean;
}) {
  if (content === "") {
    return null;
  }

  return (
    <div
      className="message-markdown text-body break-words"
      data-edited={edited ? "" : undefined}
      data-testid="message-content"
    >
      {edited ? (
        <span className="sr-only" data-slot="edited-note">
          {" "}
          (edited)
        </span>
      ) : null}
      <MessageChannelContext value={channelId}>
        <Markdown
          components={MARKDOWN_COMPONENTS}
          rehypePlugins={
            content.includes(CODE_FENCE)
              ? REHYPE_PLUGINS_WITH_CODE
              : REHYPE_PLUGINS
          }
          remarkPlugins={REMARK_PLUGINS}
        >
          {content}
        </Markdown>
      </MessageChannelContext>
    </div>
  );
});
