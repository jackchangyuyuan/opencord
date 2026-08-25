export const RETURN_TO_PARAM = "from";

export function returnToQuery(pathname: string): string {
  return `?${new URLSearchParams({ [RETURN_TO_PARAM]: pathname }).toString()}`;
}
