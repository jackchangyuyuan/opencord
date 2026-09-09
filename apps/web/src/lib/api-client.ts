export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    status: number,
    body: ApiErrorBody,
    requestId: string | null,
    retryAfterSeconds: number | null = null,
  ) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function parseRetryAfter(header: string | null): number | null {
  if (header === null) {
    return null;
  }

  const seconds = Number(header);

  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

const API_BASE = "/api/v1";

type SessionExpiredHandler = () => void;

let onSessionExpired: SessionExpiredHandler = () => undefined;

export function setSessionExpiredHandler(handler: SessionExpiredHandler): void {
  onSessionExpired = handler;
}

function parseErrorBody(payload: unknown): ApiErrorBody {
  if (typeof payload !== "object" || payload === null) {
    return { code: "UNKNOWN", message: "The request failed" };
  }

  const { error } = payload as { error?: unknown };

  if (typeof error !== "object" || error === null) {
    return { code: "UNKNOWN", message: "The request failed" };
  }

  const { code, message, details } = error as Record<string, unknown>;

  return {
    code: typeof code === "string" ? code : "UNKNOWN",
    message: typeof message === "string" ? message : "The request failed",
    ...(details === undefined ? {} : { details }),
  };
}

const MALFORMED = Symbol("malformed");

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return MALFORMED;
  }
}

export interface ApiRequest {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, init: ApiRequest = {}): Promise<T> {
  const { method = "GET", body, signal } = init;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "same-origin",
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
    ...(signal === undefined ? {} : { signal }),
  });

  const requestId = response.headers.get("x-request-id");
  const text = response.status === 204 ? "" : await response.text();
  const payload = text === "" ? undefined : parseJson(text);

  if (!response.ok) {
    if (response.status === 401) {
      onSessionExpired();
    }

    throw new ApiError(
      response.status,
      parseErrorBody(payload),
      requestId,
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }

  if (payload === MALFORMED) {
    throw new ApiError(
      response.status,
      {
        code: "MALFORMED_RESPONSE",
        message: "The server sent a response the client could not read",
      },
      requestId,
    );
  }

  return payload as T;
}
