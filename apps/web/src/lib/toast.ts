import { createToastManager, toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api-client";

const COPY: Record<string, string> = {
  ALREADY_CLAIMED: "That account has already been saved.",
  DM_NOT_PERMITTED: "You can only message people you share a server with.",
  EMAIL_TAKEN: "That email address is already in use.",
  FORBIDDEN: "You do not have permission to do that.",
  GUEST_QUOTA_REACHED:
    "You have used up what a guest gets. Save your account to keep going.",
  NONCE_REUSED: "That was already sent.",
  NOT_FOUND: "That is no longer there.",
  OWNER_MUST_TRANSFER:
    "You own this server. Hand it to somebody else before you leave.",
  PIN_LIMIT_REACHED: "This channel has as many pinned messages as it can hold.",
  RATE_LIMITED: "That was too fast. Give it a moment and try again.",
  UNAUTHORIZED: "Your session has ended. Sign in again to continue.",
  USERNAME_TAKEN: "That username is already taken.",
  USER_BANNED: "You are banned from that server.",
};

export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Something went wrong. Try again.";
  }

  return COPY[error.code] ?? error.message;
}

export function toastError(error: unknown): void {
  toastFailure(describeError(error));
}

export function toastFailure(title: string): void {
  toast.add({ id: `failure:${title}`, type: "error", title });
}

export const chatAlerts = createToastManager();

export function chatAlert(title: string): void {
  chatAlerts.add({ id: `failure:${title}`, type: "error", title });
}
