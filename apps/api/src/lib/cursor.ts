const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): string | null {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");

  return UUID_PATTERN.test(decoded) ? decoded : null;
}
