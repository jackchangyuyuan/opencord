import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  maxUploadBytes,
  UPLOAD_CONTENT_TYPES,
  type UploadKind,
} from "@opencord/shared/constants";
import type { MessageAttachmentInput } from "@opencord/shared/schemas";
import { useCallback, useState } from "react";

import { api, ApiError } from "@/lib/api-client";

export type UploadStatus = "idle" | "uploading" | "error" | "done";

export interface PendingUpload {
  id: string;
  name: string;
  previewUrl: string;
  status: UploadStatus;
  objectKey: string | null;
  width: number | null;
  height: number | null;
  error: string | null;
}

interface UploadGrant {
  objectKey: string;
  upload: { url: string; fields: Record<string, string> };
  expiresIn: number;
}

function isAllowedType(type: string): boolean {
  return (UPLOAD_CONTENT_TYPES as readonly string[]).includes(type);
}

async function postToStorage(grant: UploadGrant, file: File): Promise<void> {
  const form = new FormData();

  for (const [name, value] of Object.entries(grant.upload.fields)) {
    form.append(name, value);
  }

  form.append("file", file);

  const response = await fetch(grant.upload.url, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Storage refused the upload (${String(response.status)})`);
  }
}

async function readDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== "function") {
    return null;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };

    bitmap.close();

    return size;
  } catch {
    return null;
  }
}

function reasonFor(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "The upload failed";
}

export function useUpload(kind: UploadKind, max = MAX_ATTACHMENTS_PER_MESSAGE) {
  const [items, setItems] = useState<PendingUpload[]>([]);

  const patch = useCallback((id: string, next: Partial<PendingUpload>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...next } : item)),
    );
  }, []);

  const run = useCallback(
    async (id: string, file: File): Promise<void> => {
      patch(id, { status: "uploading", error: null });

      try {
        const size = await readDimensions(file);

        const grant = await api<UploadGrant>("/uploads", {
          method: "POST",
          body: {
            kind,
            filename: file.name,
            contentType: file.type,
            size: file.size,
          },
        });

        await postToStorage(grant, file);

        patch(id, {
          status: "done",
          objectKey: grant.objectKey,
          width: size?.width ?? null,
          height: size?.height ?? null,
        });
      } catch (error) {
        patch(id, { status: "error", error: reasonFor(error) });
      }
    },
    [kind, patch],
  );

  const add = useCallback(
    (files: readonly File[]) => {
      setItems((current) => {
        const room = max - current.length;
        const accepted = files.slice(0, Math.max(room, 0));

        const next = accepted.map((file) => {
          const rejected = !isAllowedType(file.type)
            ? "That file type is not an accepted image"
            : file.size > maxUploadBytes(kind)
              ? "That file is too large"
              : null;

          const item: PendingUpload = {
            id: crypto.randomUUID(),
            name: file.name,
            previewUrl: URL.createObjectURL(file),
            status: rejected === null ? "idle" : "error",
            objectKey: null,
            width: null,
            height: null,
            error: rejected,
          };

          if (rejected === null) {
            void run(item.id, file);
          }

          return item;
        });

        return [...current, ...next];
      });
    },
    [kind, max, run],
  );

  const remove = useCallback((id: string) => {
    setItems((current) => {
      const going = current.find((item) => item.id === id);

      if (going !== undefined) {
        URL.revokeObjectURL(going.previewUrl);
      }

      return current.filter((item) => item.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setItems((current) => {
      for (const item of current) {
        URL.revokeObjectURL(item.previewUrl);
      }

      return [];
    });
  }, []);

  const drafts: MessageAttachmentInput[] = items.flatMap((item) =>
    item.objectKey === null
      ? []
      : [
          {
            objectKey: item.objectKey,
            filename: item.name,
            ...(item.width === null ? {} : { width: item.width }),
            ...(item.height === null ? {} : { height: item.height }),
          },
        ],
  );

  return {
    items,
    drafts,
    add,
    remove,
    clear,
    isUploading: items.some((item) => item.status === "uploading"),
    isFull: items.length >= max,
  };
}
