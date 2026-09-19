import type { MessageAttachment } from "@opencord/shared/types";
import { ImageOff } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";

function reservedRatio(file: MessageAttachment): string | undefined {
  return file.width === null || file.height === null
    ? undefined
    : `${String(file.width)} / ${String(file.height)}`;
}

function Unavailable({
  file,
  single,
}: {
  file: MessageAttachment;
  single: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed bg-muted px-4 py-6 text-center",
        single ? "max-h-80" : "aspect-[4/3]",
      )}
      style={{ aspectRatio: single ? reservedRatio(file) : undefined }}
    >
      <ImageOff aria-hidden className="size-5 text-muted-foreground" />
      <p className="text-meta text-muted-foreground">Image unavailable</p>
      <p className="max-w-full truncate text-micro text-muted-foreground/80">
        {file.filename}
      </p>
    </div>
  );
}

function Attachment({
  file,
  single,
}: {
  file: MessageAttachment;
  single: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <Unavailable file={file} single={single} />;
  }

  return (
    <a
      className="group/img block overflow-hidden rounded-xl border bg-muted transition-[border-color,box-shadow] hover:border-foreground/25 hover:shadow-e2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      tabIndex={-1}
      href={file.url}
      rel="noreferrer"
      target="_blank"
    >
      <img
        alt={file.filename}
        className={cn(
          "w-full bg-muted object-cover transition-transform duration-300 group-hover/img:scale-[1.015]",
          single ? "max-h-80" : "aspect-[4/3]",
        )}
        onError={() => {
          setFailed(true);
        }}
        src={file.url}
        {...(file.width === null || file.height === null
          ? {}
          : { height: file.height, width: file.width })}
      />
    </a>
  );
}

export function MessageAttachments({
  attachments,
}: {
  attachments: readonly MessageAttachment[];
}) {
  if (attachments.length === 0) {
    return null;
  }

  const single = attachments.length === 1;

  return (
    <ul
      className={cn(
        "mt-1.5 grid gap-1.5",
        single ? "max-w-md" : "max-w-lg grid-cols-2",
      )}
    >
      {attachments.map((file) => (
        <li className="min-w-0" key={file.id}>
          <Attachment file={file} single={single} />
        </li>
      ))}
    </ul>
  );
}
