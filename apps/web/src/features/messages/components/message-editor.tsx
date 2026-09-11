import {
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
} from "@opencord/shared/constants";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { MentionMenu } from "@/features/messages/components/mention-menu";
import { useMentionCandidates } from "@/features/messages/hooks/use-mention-candidates";
import {
  activeMention,
  applyMention,
  type MentionCandidate,
  mentionOptionId,
  mentionText,
} from "@/features/messages/lib/mentions";

export function MessageEditor({
  channelId,
  content,
  allowEmpty,
  onCancel,
  onSave,
}: {
  channelId: string;
  content: string;
  allowEmpty: boolean;
  onCancel: () => void;
  onSave: (content: string) => void;
}) {
  const [value, setValue] = useState(content);
  const [caret, setCaret] = useState(content.length);
  const [selection, setSelection] = useState({ term: "", index: 0 });
  const [dismissed, setDismissed] = useState(false);
  const listId = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<number | null>(null);

  useEffect(() => {
    const field = ref.current;

    if (field !== null) {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    }
  }, []);

  useEffect(() => {
    const target = pendingCaretRef.current;

    if (target === null) {
      return;
    }

    pendingCaretRef.current = null;

    const field = ref.current;

    field?.focus();
    field?.setSelectionRange(target, target);
    setCaret(target);
  }, [value]);

  const mention = dismissed ? null : activeMention(value, caret);
  const candidates = useMentionCandidates(channelId, mention);
  const open = mention !== null && candidates.length > 0;
  const term = mention === null ? "" : `${mention.trigger}${mention.term}`;
  const highlighted =
    selection.term === term
      ? Math.min(selection.index, Math.max(candidates.length - 1, 0))
      : 0;
  const active = open ? candidates[highlighted] : undefined;

  const next = value.trim();
  const floor = allowEmpty ? 0 : MESSAGE_MIN_LENGTH;
  const ready = next.length >= floor && next.length <= MESSAGE_MAX_LENGTH;

  function accept(candidate: MentionCandidate) {
    if (mention === null) {
      return;
    }

    const inserted = applyMention(value, mention, mentionText(candidate));

    pendingCaretRef.current = inserted.caret;
    setValue(inserted.value);
    setDismissed(false);
  }

  function submit() {
    if (!ready) {
      return;
    }

    if (next === content.trim()) {
      onCancel();
      return;
    }

    onSave(next);
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!open || active === undefined) {
      return false;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelection({
        term,
        index:
          (highlighted +
            (event.key === "ArrowDown" ? 1 : -1) +
            candidates.length) %
          candidates.length,
      });

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
      return;
    }

    if (event.key === "Escape") {
      onCancel();
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5 py-1">
      {open ? (
        <MentionMenu
          candidates={candidates}
          highlighted={highlighted}
          listId={listId}
          onHighlight={(index) => {
            setSelection({ term, index });
          }}
          onPick={accept}
          side="bottom"
        />
      ) : null}
      <textarea
        aria-activedescendant={
          active === undefined ? undefined : mentionOptionId(listId, active.key)
        }
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-label="Edit message"
        className="max-h-40 min-h-9 w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        onChange={(event) => {
          setValue(event.target.value);
          setCaret(event.target.selectionStart);
          setDismissed(false);
        }}
        onClick={(event) => {
          setCaret(event.currentTarget.selectionStart);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          setCaret(event.currentTarget.selectionStart);
        }}
        ref={ref}
        rows={1}
        value={value}
      />
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Button onClick={onCancel} size="xs" variant="ghost">
          Cancel
        </Button>
        <Button disabled={!ready} onClick={submit} size="xs">
          Save
        </Button>
        <span>Enter to save, Escape to cancel</span>
      </p>
    </div>
  );
}
