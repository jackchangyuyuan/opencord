import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

import { ApiError } from "@/lib/api-client";

export interface AuthFailure {
  code?: string | undefined;
  message?: string | undefined;
}

const FIELD_BY_CODE: Record<string, { field: string; message: string }> = {
  FAILED_TO_CREATE_USER: {
    field: "username",
    message: "That username is taken",
  },
  USERNAME_TAKEN: { field: "username", message: "That username is taken" },
  EMAIL_TAKEN: { field: "email", message: "That email is already registered" },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: {
    field: "email",
    message: "That email is already registered",
  },
};

function detailFieldErrors(error: unknown): Record<string, string[]> | null {
  if (!(error instanceof ApiError)) {
    return null;
  }

  const { details } = error;

  if (typeof details !== "object" || details === null) {
    return null;
  }

  const entries = Object.entries(details).filter(
    (entry): entry is [string, string[]] =>
      Array.isArray(entry[1]) &&
      entry[1].every((message) => typeof message === "string"),
  );

  return entries.length === 0 ? null : Object.fromEntries(entries);
}

export function applyFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  failure: unknown,
  fallback: string,
): void {
  const details = detailFieldErrors(failure);

  if (details !== null) {
    for (const [field, messages] of Object.entries(details)) {
      form.setError(field as Path<T>, { message: messages.join(", ") });
    }

    return;
  }

  const { code, message } = (failure ?? {}) as AuthFailure;
  const mapped = code === undefined ? undefined : FIELD_BY_CODE[code];

  if (mapped !== undefined) {
    form.setError(mapped.field as Path<T>, { message: mapped.message });
    return;
  }

  form.setError("root", { message: message ?? fallback });
}
