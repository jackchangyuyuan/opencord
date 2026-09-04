export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function unauthorized(
  code = "UNAUTHORIZED",
  message = "Authentication required",
  details?: unknown,
): AppError {
  return new AppError(401, code, message, details);
}

export function notFound(
  code = "NOT_FOUND",
  message = "Resource not found",
  details?: unknown,
): AppError {
  return new AppError(404, code, message, details);
}

export function forbidden(
  code = "FORBIDDEN",
  message = "Forbidden",
  details?: unknown,
): AppError {
  return new AppError(403, code, message, details);
}

export function conflict(
  code: string,
  message: string,
  details?: unknown,
): AppError {
  return new AppError(409, code, message, details);
}

export function ownerMustTransfer(): AppError {
  return conflict(
    "OWNER_MUST_TRANSFER",
    "Transfer ownership before leaving this server",
  );
}

export function userBanned(): AppError {
  return forbidden("USER_BANNED", "You are banned from that server");
}

export function pinLimitReached(): AppError {
  return conflict(
    "PIN_LIMIT_REACHED",
    "This channel already has the maximum number of pins",
  );
}

export function nonceReused(): AppError {
  return conflict(
    "NONCE_REUSED",
    "That nonce already belongs to a different message",
  );
}

export function notADirectMessage(): AppError {
  return new AppError(
    400,
    "NOT_A_DM_CHANNEL",
    "That channel's roster is its server's member list",
  );
}

export function contentRequired(): AppError {
  return new AppError(
    400,
    "CONTENT_REQUIRED",
    "Only a message carrying an attachment may have empty content",
  );
}

export function uploadKeyForbidden(): AppError {
  return forbidden(
    "UPLOAD_KEY_FORBIDDEN",
    "That object key was not uploaded by you",
  );
}

export function uploadNotFound(): AppError {
  return notFound("UPLOAD_NOT_FOUND", "That upload is not in storage");
}

export function guestQuotaReached(quota: string, limit: number): AppError {
  return forbidden("GUEST_QUOTA_REACHED", "Save your account to keep going", {
    quota,
    limit,
  });
}

export function dmNotPermitted(): AppError {
  return forbidden(
    "DM_NOT_PERMITTED",
    "You can only message people you share a server with",
  );
}

export const GUEST_USE_CLAIM = "GUEST_USE_CLAIM";

export function notAGuest(): AppError {
  return conflict("NOT_A_GUEST", "This session is already a real account");
}

export function alreadyClaimed(): AppError {
  return conflict("ALREADY_CLAIMED", "This account has already been claimed");
}

export function emailTaken(): AppError {
  return conflict("EMAIL_TAKEN", "That email address is already in use");
}

export function usernameTaken(): AppError {
  return conflict("USERNAME_TAKEN", "That username is already taken");
}
