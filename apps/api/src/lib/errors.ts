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
