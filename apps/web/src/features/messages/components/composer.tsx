import { MAX_ATTACHMENTS_PER_MESSAGE } from "@opencord/shared/constants";
import { Permissions } from "@opencord/shared/permissions";
import { useQuery } from "@tanstack/react-query";
import { Paperclip, SendHorizontal } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { channelQuery } from "@/features/channels/api/queries";
import { MentionMenu } from "@/features/messages/components/mention-menu";
import { ReplyPreview } from "@/features/messages/components/reply-preview";
import { useMentionCandidates } from "@/features/messages/hooks/use-mention-candidates";
import { useMentionDirectory } from "@/features/messages/hooks/use-mention-directory";
import {
  newNonce,
  useRateLimited,
  useSendMessage,
} from "@/features/messages/hooks/use-send-message";
import { toStoredMentions } from "@/features/messages/lib/mention-syntax";
import {
  activeMention,
  applyMention,
  type MentionCandidate,
  mentionOptionId,
  mentionText,
} from "@/features/messages/lib/mentions";
import {
  has,
  useChannelPermissions,
} from "@/features/permissions/hooks/use-permissions";
import { AttachmentTray } from "@/features/uploads/components/attachment-tray";
import { useUpload } from "@/features/uploads/hooks/use-upload";
import { currentUserQuery } from "@/features/users/api/queries";
import { cn } from "@/lib/cn";
import { socket } from "@/lib/socket";
import { useDraft, useDrafts } from "@/stores/drafts";
import { useUi } from "@/stores/ui";

const TYPING_THROTTLE_MS = 2000;

export function Composer({
  channelId,
  onSend,
}: {
  channelId: string;
  onSend?: (() => void) | undefined;
}) {
  const lastTypedRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const listId = useId();
  const [caret, setCaret] = useState(0);
  const [selection, setSelection] = useState({ term: "", index: 0 });
  const [dismissed, setDismissed] = useState(false);
  const draft = useDraft(channelId);
  const setDraft = useDrafts((state) => state.setDraft);
  const { data: me } = useQuery(currentUserQuery);
  const { send } = useSendMessage(channelId);
  const mentions = useMentionDirectory(channelId);
  const replyTarget = useUi((state) => state.replyTarget);
  const setReplyTarget = useUi((state) => state.setReplyTarget);
  const uploads = useUpload("attachment");
  const { data: channel } = useQuery(channelQuery(channelId));
  const slowDown = useRateLimited();

  const maySend = has(
    useChannelPermissions(channelId),
    Permissions.SEND_MESSAGES,
  );

  const mention = maySend && !dismissed ? activeMention(draft, caret) : null;
  const candidates = useMentionCandidates(channelId, mention);
  const open = mention !== null && candidates.length > 0;
  const term = mention === null ? "" : `${mention.trigger}${mention.term}`;
  const highlighted =
    selection.term === term
      ? Math.min(selection.index, Math.max(candidates.length - 1, 0))
      : 0;
  const active = open ? candidates[highlighted] : undefined;

  const highlight = (index: number) => {
    setSelection({ term, index });
  };

  const repliedToRef = useRef<string | null>(null);

  useEffect(() => {
    const target =
      replyTarget?.channelId === channelId ? replyTarget.messageId : null;

    if (target === null || repliedToRef.current === target) {
      repliedToRef.current = target;
      return;
    }

    repliedToRef.current = target;

    const field = textareaRef.current;

    if (field === null || field.disabled || document.activeElement === field) {
      return;
    }

    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
  }, [channelId, replyTarget]);

  useLayoutEffect(() => {
    const field = textareaRef.current;

    if (field === null) {
      return;
    }

    field.style.height = "auto";
    field.style.height = `${String(field.scrollHeight)}px`;
  }, [draft]);

  useEffect(() => {
    const target = pendingCaretRef.current;

    if (target === null) {
      return;
    }

    pendingCaretRef.current = null;

    const field = textareaRef.current;

    field?.focus();
    field?.setSelectionRange(target, target);
    setCaret(target);
  }, [draft]);

  const content = draft.trim();

  const ready =
    maySend &&
    me !== undefined &&
    !slowDown &&
    !uploads.isUploading &&
    (content.length > 0 || uploads.drafts.length > 0);

  function accept(candidate: MentionCandidate) {
    if (mention === null) {
      return;
    }

    const next = applyMention(draft, mention, mentionText(candidate));

    pendingCaretRef.current = next.caret;
    setDraft(channelId, next.value);
    setDismissed(false);
  }

  function submit() {
    if (!ready) {
      return;
    }

    const replyingHere =
      replyTarget?.channelId === channelId ? replyTarget : null;

    const resolved = toStoredMentions(content, mentions.read());

    mentions.seed(resolved);

    onSend?.();

    send({
      content,
      optimisticContent: resolved.content,
      nonce: newNonce(),
      authorId: me.id,
      ...(replyingHere === null
        ? {}
        : {
            replyToId: replyingHere.messageId,
            replyTo: {
              id: replyingHere.messageId,
              authorId: replyingHere.authorId,
              content: replyingHere.content,
              deletedAt: null,
            },
          }),
      ...(uploads.drafts.length === 0 ? {} : { attachments: uploads.drafts }),
    });

    setDraft(channelId, "");
    setReplyTarget(null);
    uploads.clear();
  }

  function onFilesChosen(event: ChangeEvent<HTMLInputElement>) {
    uploads.add([...(event.target.files ?? [])]);
    event.target.value = "";
  }

  function announceTyping() {
    const now = Date.now();

    if (now - lastTypedRef.current < TYPING_THROTTLE_MS) {
      return;
    }

    lastTypedRef.current = now;
    socket.emit("typing:start", { channelId });
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!open || active === undefined) {
      return false;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      highlight(
        (highlighted +
          (event.key === "ArrowDown" ? 1 : -1) +
          candidates.length) %
          candidates.length,
      );

      return true;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      accept(active);

      return true;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);

      return true;
    }

    return false;
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (onMenuKeyDown(event)) {
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function trackCaret(field: HTMLTextAreaElement) {
    setCaret(field.selectionStart);
  }

  return (
    <>
      <ReplyPreview channelId={channelId} />
      <AttachmentTray items={uploads.items} onRemove={uploads.remove} />

      <div className="relative flex min-h-footer shrink-0 items-center px-5 py-1">
        {open ? (
          <MentionMenu
            candidates={candidates}
            highlighted={highlighted}
            listId={listId}
            onHighlight={highlight}
            onPick={accept}
          />
        ) : null}

        <div
          className={cn(
            "flex min-h-footer-control min-w-0 flex-1 items-center rounded-2xl border bg-card px-2 py-1 shadow-e1 transition-[border-color,box-shadow]",
            "focus-within:border-ring/40 focus-within:shadow-e2",
            !maySend && "opacity-70",
          )}
        >
          <div className="flex min-w-0 flex-1 items-end gap-1.5">
            <input
              accept="image/png,image/jpeg,image/webp,image/gif"
              aria-label="Image files to attach"
              className="sr-only"
              multiple
              onChange={onFilesChosen}
              ref={fileInputRef}
              tabIndex={-1}
              type="file"
            />
            <Button
              aria-label={`Attach images, up to ${String(MAX_ATTACHMENTS_PER_MESSAGE)}`}
              className="text-muted-foreground hover:text-foreground"
              disabled={uploads.isFull}
              onClick={() => {
                fileInputRef.current?.click();
              }}
              size="icon"
              variant="ghost"
            >
              <Paperclip />
            </Button>
            <textarea
              aria-label="Message"
              className="max-h-48 min-h-9 flex-1 resize-none overflow-y-auto rounded-lg bg-transparent px-2 py-1 text-body leading-7 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
              aria-activedescendant={
                active === undefined
                  ? undefined
                  : mentionOptionId(listId, active.key)
              }
              aria-autocomplete="list"
              aria-controls={open ? listId : undefined}
              onChange={(event) => {
                setDraft(channelId, event.target.value);
                setCaret(event.target.selectionStart);
                setDismissed(false);

                if (event.target.value.length > 0) {
                  announceTyping();
                }
              }}
              disabled={!maySend}
              onClick={(event) => {
                trackCaret(event.currentTarget);
              }}
              onKeyDown={onKeyDown}
              onKeyUp={(event) => {
                trackCaret(event.currentTarget);
              }}
              ref={textareaRef}
              placeholder={
                maySend
                  ? channel?.name == null
                    ? "Write a message"
                    : `Message #${channel.name}`
                  : "You cannot send messages in this channel"
              }
              rows={1}
              value={draft}
            />
            <Button
              aria-label={
                slowDown ? "Sending too fast, wait a moment" : "Send message"
              }
              className="transition-transform duration-150 not-disabled:hover:scale-105"
              disabled={!ready}
              onClick={submit}
              size="icon"
            >
              <SendHorizontal />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
