import { Permissions } from "@opencord/shared/permissions";
import { useQuery } from "@tanstack/react-query";
import { SendHorizontal } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  newNonce,
  useSendMessage,
} from "@/features/messages/hooks/use-send-message";
import {
  has,
  useChannelPermissions,
} from "@/features/permissions/hooks/use-permissions";
import { currentUserQuery } from "@/features/users/api/queries";
import { socket } from "@/lib/socket";
import { useDraft, useDrafts } from "@/stores/drafts";

const TYPING_THROTTLE_MS = 2000;

export function Composer({ channelId }: { channelId: string }) {
  const lastTypedRef = useRef(0);
  const draft = useDraft(channelId);
  const setDraft = useDrafts((state) => state.setDraft);
  const { data: me } = useQuery(currentUserQuery);
  const { send } = useSendMessage(channelId);

  const maySend = has(
    useChannelPermissions(channelId),
    Permissions.SEND_MESSAGES,
  );

  const content = draft.trim();
  const ready = maySend && content.length > 0 && me !== undefined;

  function submit() {
    if (!ready) {
      return;
    }

    send({ content, nonce: newNonce(), authorId: me.id });
    setDraft(channelId, "");
  }

  function announceTyping() {
    const now = Date.now();

    if (now - lastTypedRef.current < TYPING_THROTTLE_MS) {
      return;
    }

    lastTypedRef.current = now;
    socket.emit("typing:start", { channelId });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t p-3">
      <textarea
        aria-label="Message"
        className="max-h-40 min-h-9 flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        onChange={(event) => {
          setDraft(channelId, event.target.value);

          if (event.target.value.length > 0) {
            announceTyping();
          }
        }}
        disabled={!maySend}
        onKeyDown={onKeyDown}
        placeholder={
          maySend
            ? "Write a message"
            : "You cannot send messages in this channel"
        }
        rows={1}
        value={draft}
      />
      <Button
        aria-label="Send message"
        disabled={!ready}
        onClick={submit}
        size="icon"
      >
        <SendHorizontal />
      </Button>
    </div>
  );
}
