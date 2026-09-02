import { z } from "zod";

import {
  FILENAME_MAX_LENGTH,
  maxUploadBytes,
  UPLOAD_CONTENT_TYPES,
  UPLOAD_KINDS,
} from "../constants/index.js";

const PATH_OR_CONTROL = /[\p{Cc}/\\]/gu;

export function sanitizeFilename(value: string): string {
  return value.replaceAll(PATH_OR_CONTROL, "_").trim();
}

export const uploadFilenameSchema = z
  .string()
  .min(1)
  .max(FILENAME_MAX_LENGTH)
  .transform(sanitizeFilename)
  .refine((value) => value.length > 0, {
    error: "must contain something other than separators",
  });

export const uploadKindSchema = z.enum(UPLOAD_KINDS);

export const uploadContentTypeSchema = z.enum(UPLOAD_CONTENT_TYPES);

export const createUploadSchema = z
  .object({
    kind: uploadKindSchema,
    filename: uploadFilenameSchema,
    contentType: uploadContentTypeSchema,
    size: z.int().min(1),
  })
  .check((ctx) => {
    const limit = maxUploadBytes(ctx.value.kind);

    if (ctx.value.size > limit) {
      ctx.issues.push({
        code: "too_big",
        origin: "number",
        maximum: limit,
        inclusive: true,
        input: ctx.value.size,
        path: ["size"],
      });
    }
  });

export type CreateUploadInput = z.infer<typeof createUploadSchema>;
