import type { MessageAttachment } from "@opencord/shared/types";

export function MessageAttachments({
  attachments,
}: {
  attachments: readonly MessageAttachment[];
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <ul className="mt-1 flex flex-wrap gap-2">
      {attachments.map((file) => (
        <li key={file.id}>
          <a
            className="block max-w-xs rounded-lg focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
            href={file.url}
            rel="noreferrer"
            target="_blank"
          >
            <img
              alt={file.filename}
              className="h-auto max-h-80 w-full rounded-lg object-cover"
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
