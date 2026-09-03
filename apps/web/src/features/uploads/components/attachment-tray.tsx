import { AttachmentCard } from "@/features/uploads/components/attachment-card";
import type { PendingUpload } from "@/features/uploads/hooks/use-upload";

export function AttachmentTray({
  items,
  onRemove,
}: {
  items: readonly PendingUpload[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul
      aria-label="Attachments"
      className="flex gap-2 overflow-x-auto border-t px-3 pt-3"
    >
      {items.map((item) => (
        <AttachmentCard item={item} key={item.id} onRemove={onRemove} />
      ))}
    </ul>
  );
}
