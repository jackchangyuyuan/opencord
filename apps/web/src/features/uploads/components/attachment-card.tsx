import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Truncated } from "@/components/ui/truncated";
import type { PendingUpload } from "@/features/uploads/hooks/use-upload";
import { cn } from "@/lib/cn";

export function AttachmentCard({
  item,
  onRemove,
}: {
  item: PendingUpload;
  onRemove: (id: string) => void;
}) {
  return (
    <li
      className={cn(
        "relative flex w-28 shrink-0 flex-col gap-1 rounded-lg border p-1",
        item.status === "error" && "border-destructive",
      )}
    >
      <img
        alt=""
        className="h-16 w-full rounded object-cover"
        height={64}
        src={item.previewUrl}
        width={104}
      />
      {item.status === "error" ? (
        <span
          className="truncate px-1 text-micro text-destructive"
          role="alert"
        >
          {item.error ?? "The upload failed"}
        </span>
      ) : (
        <Truncated
          className="px-1 text-micro text-muted-foreground"
          value={item.name}
        />
      )}
      {item.status === "uploading" ? (
        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/60">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          <span className="sr-only">{`Uploading ${item.name}`}</span>
        </span>
      ) : null}
      <Button
        aria-label={`Remove ${item.name}`}
        className="absolute -top-2 -right-2 rounded-full bg-background"
        onClick={() => {
          onRemove(item.id);
        }}
        size="icon-xs"
        variant="outline"
      >
        <X />
      </Button>
    </li>
  );
}
