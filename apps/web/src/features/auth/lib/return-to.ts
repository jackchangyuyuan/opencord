export const RETURN_TO_PARAM = "from";

const DEFAULT_DESTINATION = "/app";

export function returnToQuery(pathname: string): string {
  return `?${new URLSearchParams({ [RETURN_TO_PARAM]: pathname }).toString()}`;
}

export function readReturnTo(params: URLSearchParams): string {
  const from = params.get(RETURN_TO_PARAM);

  if (from === null || !from.startsWith("/") || from.startsWith("//")) {
    return DEFAULT_DESTINATION;
  }

  return from;
}

export function forwardReturnTo(path: string, params: URLSearchParams): string {
  const from = params.get(RETURN_TO_PARAM);

  return from === null ? path : `${path}${returnToQuery(from)}`;
}
