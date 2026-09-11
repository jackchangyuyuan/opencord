import { MessageContent } from "@/features/messages/components/message-content";
import { MessageEditor } from "@/features/messages/components/message-editor";
import {
  useMentionDirectory,
  useStoredMentions,
} from "@/features/messages/hooks/use-mention-directory";
import type { ChatMessage } from "@/features/messages/lib/cache";
import {
  toEditableMentions,
  toStoredMentions,
} from "@/features/messages/lib/mention-syntax";

export function MessageEditHost({
  message,
  onCancel,
  onSave,
}: {
  message: ChatMessage;
  onCancel: () => void;
  onSave: (message: ChatMessage, content: string, optimistic: string) => void;
}) {
  const { directory, pending } = useStoredMentions(
    message.channelId,
    message.content,
  );
  const { read, seed } = useMentionDirectory(message.channelId);

  if (pending) {
    return (
      <MessageContent
        channelId={message.channelId}
        content={message.content}
        edited={message.editedAt !== null}
      />
    );
  }

  return (
    <MessageEditor
      allowEmpty={message.attachments.length > 0}
      channelId={message.channelId}
      content={toEditableMentions(message.content, directory)}
      onCancel={onCancel}
      onSave={(typed) => {
        const resolved = toStoredMentions(typed, read());

        seed(resolved);
        onSave(message, typed, resolved.content);
      }}
    />
  );
}
