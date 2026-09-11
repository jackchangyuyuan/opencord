import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  maxUploadBytes,
  UPLOAD_CONTENT_TYPES,
  type UploadKind,
} from "@opencord/shared/constants";
import type { MessageAttachmentInput } from "@opencord/shared/schemas";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError } from "@/lib/api-client";
import { chatAlert, toastFailure } from "@/lib/toast";

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

async function postToStorage(
  grant: UploadGrant,
  file: File,
  signal: AbortSignal,
): Promise<void> {
  const form = new FormData();

  for (const [name, value] of Object.entries(grant.upload.fields)) {
    form.append(name, value);
  }

  form.append("file", file);

  const response = await fetch(grant.upload.url, {
    method: "POST",
    body: form,
    signal,
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

function refusalFor(file: File, kind: UploadKind): string | null {
  if (!isAllowedType(file.type)) {
    return "That file type is not an accepted image";
  }

  return file.size > maxUploadBytes(kind) ? "That file is too large" : null;
}

export function useUpload(kind: UploadKind, max = MAX_ATTACHMENTS_PER_MESSAGE) {
  const [items, setItems] = useState<PendingUpload[]>([]);

  const heldRef = useRef<PendingUpload[]>([]);
  const inFlightRef = useRef(new Map<string, AbortController>());

  const write = useCallback(
    (next: (current: readonly PendingUpload[]) => PendingUpload[]) => {
      heldRef.current = next(heldRef.current);
      setItems(heldRef.current);
    },
    [],
  );

  const announce = kind === "attachment" ? chatAlert : toastFailure;

  const patch = useCallback(
    (id: string, next: Partial<PendingUpload>) => {
      write((current) =>
        current.map((item) => (item.id === id ? { ...item, ...next } : item)),
      );
    },
    [write],
  );

  const discard = useCallback((going: readonly PendingUpload[]) => {
    for (const item of going) {
      inFlightRef.current.get(item.id)?.abort();
      inFlightRef.current.delete(item.id);
      URL.revokeObjectURL(item.previewUrl);
    }
  }, []);

  const run = useCallback(
    async (id: string, file: File): Promise<void> => {
      const attempt = new AbortController();

      inFlightRef.current.set(id, attempt);
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
          signal: attempt.signal,
        });

        await postToStorage(grant, file, attempt.signal);

        patch(id, {
          status: "done",
          objectKey: grant.objectKey,
          width: size?.width ?? null,
          height: size?.height ?? null,
        });
      } catch (error) {
        if (attempt.signal.aborted) {
          return;
        }

        const reason = reasonFor(error);

        patch(id, { status: "error", error: reason });
        announce(reason);
      } finally {
        inFlightRef.current.delete(id);
      }
    },
    [announce, kind, patch],
  );

  const add = useCallback(
    (files: readonly File[]) => {
      const room = Math.max(max - heldRef.current.length, 0);

      const accepted = files.slice(0, room).map((file) => ({
        file,
        refusal: refusalFor(file, kind),
        id: crypto.randomUUID(),
        previewUrl: URL.createObjectURL(file),
      }));

      write((current) => [
        ...current,
        ...accepted.map(({ file, refusal, id, previewUrl }): PendingUpload => ({
          id,
          name: file.name,
          previewUrl,
          status: refusal === null ? "idle" : "error",
          objectKey: null,
          width: null,
          height: null,
          error: refusal,
        })),
      ]);

      for (const entry of accepted) {
        if (entry.refusal === null) {
          void run(entry.id, entry.file);
        } else {
          announce(entry.refusal);
        }
      }
    },
    [announce, kind, max, run, write],
  );

  const remove = useCallback(
    (id: string) => {
      discard(heldRef.current.filter((item) => item.id === id));
      write((current) => current.filter((item) => item.id !== id));
    },
    [discard, write],
  );

  const clear = useCallback(() => {
    discard(heldRef.current);
    write(() => []);
  }, [discard, write]);

  useEffect(
    () => () => {
      discard(heldRef.current);
      heldRef.current = [];
    },
    [discard],
  );

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
