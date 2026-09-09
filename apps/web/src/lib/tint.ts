const HUES = [274, 300, 340, 18, 162, 196, 226, 250];

export function tintHue(id: string): number {
  let hash = 0;

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }

  return HUES[hash % HUES.length] ?? 274;
}
