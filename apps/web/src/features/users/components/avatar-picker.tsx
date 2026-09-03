import { maxUploadBytes, type UploadKind } from "@opencord/shared/constants";
import { useRef } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useUpload } from "@/features/uploads/hooks/use-upload";

function mebibytes(bytes: number): string {
  return `${String(Math.round(bytes / (1024 * 1024)))} MB`;
}

export function AvatarPicker({
  currentUrl,
  fallback,
  kind,
  label,
  onPicked,
}: {
  currentUrl: string | null;
  fallback: string;
  kind: Extract<UploadKind, "avatar" | "icon">;
  label: string;
  onPicked: (objectKey: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploads = useUpload(kind, 1);

  const item = uploads.items[0];
  const pendingKey = item?.objectKey ?? null;
  const preview = item?.status === "done" ? item.previewUrl : currentUrl;

  return (
    <div className="flex items-center gap-3">
      <Avatar aria-hidden className="size-14">
        <AvatarImage alt="" src={preview ?? undefined} />
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>

      <div className="flex flex-col gap-1">
        <input
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label={label}
          className="sr-only"
          onChange={(event) => {
            const [file] = [...(event.target.files ?? [])];

            uploads.clear();

            if (file !== undefined) {
              uploads.add([file]);
            }

            event.target.value = "";
          }}
          ref={inputRef}
          tabIndex={-1}
          type="file"
        />
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              inputRef.current?.click();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {label}
          </Button>
          <Button
            disabled={pendingKey === null}
            onClick={() => {
              if (pendingKey !== null) {
                onPicked(pendingKey);
              }
            }}
            size="sm"
            type="button"
          >
            Save image
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {`PNG, JPEG, WebP or GIF, up to ${mebibytes(maxUploadBytes(kind))}.`}
        </p>
        {item?.status === "uploading" ? (
          <p className="text-xs text-muted-foreground">Uploading…</p>
        ) : null}
        {item?.status === "error" ? (
          <p className="text-xs text-destructive" role="alert">
            {item.error ?? "The upload failed"}
          </p>
        ) : null}
      </div>
    </div>
  );
}
