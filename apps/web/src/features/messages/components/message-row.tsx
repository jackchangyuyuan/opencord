import { useQuery } from "@tanstack/react-query";
import { Pencil, Pin, PinOff, Reply, Trash2 } from "lucide-react";
import { memo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EmojiPicker } from "@/features/messages/components/emoji-picker";
import { MessageAttachments } from "@/features/messages/components/message-attachments";
import { MessageContent } from "@/features/messages/components/message-content";
import { MessageEditHost } from "@/features/messages/components/message-edit-host";
import { PinnedIndicator } from "@/features/messages/components/pinned-indicator";
import { ReactionBar } from "@/features/messages/components/reaction-bar";
import { ReplyContext } from "@/features/messages/components/reply-context";
import type { ChatMessage } from "@/features/messages/lib/cache";
import { userQuery } from "@/features/users/api/queries";
import { UserAvatar } from "@/features/users/components/user-avatar";
import { UserProfilePopover } from "@/features/users/components/user-profile-popover";
import { cn } from "@/lib/cn";
import {
  releaseAfterPointer,
  usePointerActivationLatch,
} from "@/lib/pointer-focus";
import { useUi } from "@/stores/ui";

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const FULL = new Intl.DateTimeFormat(undefined, {
  dateStyle: "full",
  timeStyle: "short",
});

function ToolbarButton({
  children,
  label,
  onClick,
  destructive = false,
  staysPut = false,
}: {
  children: ReactNode;
  label: string;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  destructive?: boolean;
  staysPut?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        render={
          <Button
            className={
              destructive
                ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                : "text-muted-foreground hover:text-foreground"
            }
            onClick={(event) => {
              onClick(event);

              if (staysPut) {
                releaseAfterPointer(event);
              }
            }}
            size="icon-sm"
            tabIndex={-1}
            variant="ghost"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export const MessageRow = memo(function MessageRow({
  message,
  grouped,
  separated = !grouped,
  serverId,
  editing = false,
  highlighted = false,
  onRetry,
  onDiscard,
  onToggleReaction,
  onReply,
  onTogglePin,
  onEdit,
  onDelete,
  onCancelEdit,
  onSaveEdit,
  onJumpToMessage,
}: {
  message: ChatMessage;
  grouped: boolean;
  separated?: boolean;
  serverId?: string | undefined;
  editing?: boolean;
  highlighted?: boolean;
  onRetry?: (message: ChatMessage) => void;
  onDiscard?: (message: ChatMessage) => void;
  onToggleReaction?: (messageId: string, emoji: string, add: boolean) => void;
  onReply?: (message: ChatMessage) => void;
  onTogglePin?: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (message: ChatMessage) => void;
  onCancelEdit?: () => void;
  onJumpToMessage?: (messageId: string) => void;
  onSaveEdit?: (
    message: ChatMessage,
    content: string,
    optimistic: string,
  ) => void;
}) {
  const { data: author } = useQuery(userQuery(message.authorId));
  const openModal = useUi((state) => state.openModal);
  const activation = usePointerActivationLatch();

  const name = author?.name ?? "Unknown";
  const at = new Date(message.createdAt);

  if (message.deletedAt !== null) {
    return (
      <div className={separated ? "pt-3" : undefined}>
        <article className="px-5 py-1 pl-[4.75rem] text-body text-muted-foreground italic">
          This message was deleted.
        </article>
      </div>
    );
  }

  const local = message.local;
  const failed = local?.status === "failed";

  const actionable =
    local === undefined &&
    !editing &&
    (onReply !== undefined ||
      onTogglePin !== undefined ||
      onEdit !== undefined ||
      onDelete !== undefined ||
      onToggleReaction !== undefined);

  const row = (
    <div
      className={separated ? "pt-3" : undefined}
      data-local-status={local?.status}
    >
      <article
        className={cn(
          "group relative flex flex-col px-5 py-1 transition-colors duration-75",
          "focus-within:bg-accent/50 hover:bg-accent/50",
          highlighted &&
            "border-l-2 border-brand bg-brand-subtle/60 pl-[1.125rem]",
          local !== undefined && !failed && "opacity-55",
          failed &&
            "border-l-2 border-destructive bg-destructive/5 pl-[1.125rem] hover:bg-destructive/5",
        )}
        data-message-row
        tabIndex={-1}
      >
        <ReplyContext
          channelId={message.channelId}
          replyTo={message.replyTo}
          {...(onJumpToMessage === undefined
            ? {}
            : { onJump: onJumpToMessage })}
        />

        <div className="flex gap-4">
          <div className="w-11 shrink-0">
            {grouped ? (
              <time
                className="block text-right text-micro leading-[var(--text-body--line-height)] whitespace-nowrap text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                dateTime={message.createdAt}
              >
                {TIME.format(at)}
              </time>
            ) : (
              <UserProfilePopover
                className="flex rounded-full focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                label={`${name}'s profile`}
                serverId={serverId}
                tabbable={false}
                userId={message.authorId}
              >
                <UserAvatar
                  avatarUrl={author?.avatarUrl ?? null}
                  className="mt-0.5"
                  name={name}
                  ring="ring-background"
                  size="lg"
                  userId={message.authorId}
                />
              </UserProfilePopover>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {grouped ? null : (
              <p className="flex items-baseline gap-2.5 pb-0.5">
                <UserProfilePopover
                  className="rounded text-base leading-6 font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  label={`${name}'s profile`}
                  serverId={serverId}
                  tabbable={false}
                  userId={message.authorId}
                >
                  {name}
                </UserProfilePopover>
                <time
                  className="text-micro text-muted-foreground"
                  dateTime={message.createdAt}
                  title={FULL.format(at)}
                >
                  {TIME.format(at)}
                </time>
                <PinnedIndicator pinnedAt={message.pinnedAt} />
              </p>
            )}

            {editing ? (
              <MessageEditHost
                message={message}
                onCancel={() => {
                  onCancelEdit?.();
                }}
                onSave={(entry, content, optimistic) => {
                  onSaveEdit?.(entry, content, optimistic);
                }}
              />
            ) : (
              <MessageContent
                channelId={message.channelId}
                content={message.content}
                edited={message.editedAt !== null}
              />
            )}

            <MessageAttachments attachments={message.attachments} />

            <ReactionBar
              disabled={onToggleReaction === undefined || local !== undefined}
              onToggle={(emoji, add) => {
                onToggleReaction?.(message.id, emoji, add);
              }}
              reactions={message.reactions}
            />

            {failed ? (
              <p className="mt-1.5 flex items-center gap-2 text-meta text-destructive">
                <span role="alert">{local.reason ?? "Could not send"}</span>
                {local.retry === "claim" ? (
                  <Button
                    onClick={() => {
                      openModal("claim-account");
                    }}
                    size="xs"
                    tabIndex={-1}
                    variant="outline"
                  >
                    Save my account
                  </Button>
                ) : local.retry === "none" ? null : (
                  <Button
                    onClick={() => onRetry?.(message)}
                    size="xs"
                    tabIndex={-1}
                    variant="outline"
                  >
                    Retry
                  </Button>
                )}
                <Button
                  onClick={() => onDiscard?.(message)}
                  size="xs"
                  tabIndex={-1}
                  variant="ghost"
                >
                  Delete
                </Button>
              </p>
            ) : null}
          </div>
        </div>

        {actionable ? (
          <div className="absolute -top-4 right-5 z-10 flex items-center gap-0.5 rounded-xl border bg-popover p-1 opacity-0 shadow-e2 transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100 has-aria-expanded:opacity-100">
            {onToggleReaction === undefined ? null : (
              <EmojiPicker
                onPick={(emoji) => {
                  onToggleReaction(message.id, emoji, true);
                }}
              />
            )}
            {onReply === undefined ? null : (
              <ToolbarButton
                label="Reply"
                onClick={() => {
                  onReply(message);
                }}
              >
                <Reply />
              </ToolbarButton>
            )}
            {onEdit === undefined ? null : (
              <ToolbarButton
                label="Edit"
                onClick={() => {
                  onEdit(message);
                }}
              >
                <Pencil />
              </ToolbarButton>
            )}
            {onTogglePin === undefined ? null : (
              <ToolbarButton
                label={message.pinnedAt === null ? "Pin" : "Unpin"}
                onClick={(event) => {
                  event.stopPropagation();
                  onTogglePin(message);
                }}
                staysPut
              >
                {message.pinnedAt === null ? <Pin /> : <PinOff />}
              </ToolbarButton>
            )}
            {onDelete === undefined ? null : (
              <ToolbarButton
                destructive
                label="Delete"
                onClick={() => {
                  onDelete(message);
                }}
              >
                <Trash2 />
              </ToolbarButton>
            )}
          </div>
        ) : null}
      </article>
    </div>
  );

  if (
    (onReply === undefined &&
      onTogglePin === undefined &&
      onEdit === undefined &&
      onDelete === undefined) ||
    local !== undefined ||
    editing
  ) {
    return row;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={row} />
      <ContextMenuContent finalFocus={activation.finalFocus}>
        {onReply === undefined ? null : (
          <ContextMenuItem
            onClick={(event) => {
              activation.note(event);
              onReply(message);
            }}
          >
            Reply
          </ContextMenuItem>
        )}
        {onEdit === undefined ? null : (
          <ContextMenuItem
            onClick={(event) => {
              activation.note(event);
              onEdit(message);
            }}
          >
            Edit
          </ContextMenuItem>
        )}
        {onDelete === undefined ? null : (
          <ContextMenuItem
            onClick={(event) => {
              activation.note(event);
              onDelete(message);
            }}
            variant="destructive"
          >
            Delete
          </ContextMenuItem>
        )}
        {onTogglePin === undefined ? null : (
          <ContextMenuItem
            onClick={(event) => {
              activation.note(event);
              onTogglePin(message);
            }}
          >
            {message.pinnedAt === null ? "Pin" : "Unpin"}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
});
