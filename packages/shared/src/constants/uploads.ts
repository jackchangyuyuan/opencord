export const UPLOAD_KINDS = ["attachment", "avatar", "icon"] as const;

export type UploadKind = (typeof UPLOAD_KINDS)[number];

export const UPLOAD_PREFIX = {
  attachment: "attachments",
  avatar: "avatars",
  icon: "icons",
} as const satisfies Record<UploadKind, string>;

export const UPLOAD_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

export const UPLOAD_EXTENSION = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const satisfies Record<UploadContentType, string>;

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_AVATAR_BYTES = 1024 * 1024;

export const FILENAME_MAX_LENGTH = 255;

export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

export const DIMENSION_MIN = 1;
export const DIMENSION_MAX = 20_000;

export const UPLOAD_ASSOCIATION_WINDOW_MS = 10 * 60 * 1000;

export const UPLOAD_GRANT_TTL_SECONDS = 60;

export function maxUploadBytes(kind: UploadKind): number {
  return kind === "attachment" ? MAX_ATTACHMENT_BYTES : MAX_AVATAR_BYTES;
}
