export function localDay(iso: string): string {
  const at = new Date(iso);

  return [
    String(at.getFullYear()).padStart(4, "0"),
    String(at.getMonth() + 1).padStart(2, "0"),
    String(at.getDate()).padStart(2, "0"),
  ].join("-");
}
