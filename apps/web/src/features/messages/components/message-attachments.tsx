import type { MessageAttachment } from "@opencord/shared/types";

import { cn } from "@/lib/cn";

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
              src={file.url}
              {...(file.width === null || file.height === null
                ? {}
                : { height: file.height, width: file.width })}
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
