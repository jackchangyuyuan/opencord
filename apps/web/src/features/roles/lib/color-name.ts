import { ROLE_PALETTE } from "@/features/roles/api/queries";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function toRgb(value: number): Rgb {
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

export function hexOf(value: number): string {
  return `#${value.toString(16).padStart(6, "0").toUpperCase()}`;
}

const VOCABULARY: { name: string; value: number }[] = [
  { name: "Black", value: 0x000000 },
  { name: "White", value: 0xffffff },
  { name: "Grey", value: 0x9ca3af },
  { name: "Dark grey", value: 0x4b5563 },
  { name: "Slate", value: 0x64748b },
  { name: "Red", value: 0xef4444 },
  { name: "Dark red", value: 0x991b1b },
  { name: "Orange", value: 0xf97316 },
  { name: "Amber", value: 0xf59e0b },
  { name: "Yellow", value: 0xfacc15 },
  { name: "Green", value: 0x22c55e },
  { name: "Dark green", value: 0x15803d },
  { name: "Teal", value: 0x14b8a6 },
  { name: "Cyan", value: 0x06b6d4 },
  { name: "Light blue", value: 0x7dd3fc },
  { name: "Blue", value: 0x3b82f6 },
  { name: "Dark blue", value: 0x1e3a8a },
  { name: "Violet", value: 0x8b5cf6 },
  { name: "Purple", value: 0x9333ea },
  { name: "Pink", value: 0xec4899 },
  { name: "Brown", value: 0x92400e },
];

function distance(a: Rgb, b: Rgb): number {
  const mean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;

  return (
    (2 + mean / 256) * dr * dr +
    4 * dg * dg +
    (2 + (255 - mean) / 256) * db * db
  );
}

const PALETTE_NAMES = new Map<number, string>(
  ROLE_PALETTE.map((entry) => [entry.value, entry.name]),
);

export function colorName(value: number): string {
  const exact = PALETTE_NAMES.get(value);

  if (exact !== undefined) {
    return exact;
  }

  const target = toRgb(value);

  let best = VOCABULARY[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const entry of VOCABULARY) {
    const candidate = distance(target, toRgb(entry.value));

    if (candidate < bestDistance) {
      bestDistance = candidate;
      best = entry;
    }
  }

  return best?.name ?? "Custom";
}

export const NO_COLOUR = "none";
export const NO_COLOUR_LABEL = "No colour";
