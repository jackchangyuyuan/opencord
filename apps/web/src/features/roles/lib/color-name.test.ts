import { describe, expect, it } from "vitest";

import { ROLE_PALETTE } from "@/features/roles/api/queries";
import { colorName, hexOf, toRgb } from "@/features/roles/lib/color-name";

describe("colorName", () => {
  it("gives every palette colour the palette's own name", () => {
    for (const entry of ROLE_PALETTE) {
      expect(colorName(entry.value)).toBe(entry.name);
    }
  });

  it("never returns a hex string or a digit", () => {
    for (const value of [
      0x000000,
      0xffffff,
      0xe67e22,
      0x123456,
      0x7f7f7f,
      0xffffff - 1,
      0x00ff00,
      0x0000ff,
      0xff00ff,
    ]) {
      const name = colorName(value);

      expect(name).not.toMatch(/[#\d]/);
      expect(name.length).toBeGreaterThan(2);
    }
  });

  it("names an off-palette colour after the nearest word", () => {
    expect(colorName(0xe67e22)).toBe("Orange");
    expect(colorName(0x000000)).toBe("Black");
    expect(colorName(0xffffff)).toBe("White");
    expect(colorName(0x14532d)).toBe("Dark green");
    expect(colorName(0x1e40af)).toBe("Dark blue");
  });

  it("calls a green a green rather than a grey", () => {
    expect(colorName(0x3fa860)).toBe("Green");
  });

  it("is stable -- the same value always gets the same word", () => {
    expect(colorName(0x8b5cf6)).toBe(colorName(0x8b5cf6));
  });
});

describe("hexOf and toRgb", () => {
  it("round-trips the storage form", () => {
    expect(hexOf(0x3b82f6)).toBe("#3B82F6");
    expect(hexOf(0)).toBe("#000000");
    expect(toRgb(0x3b82f6)).toEqual({ r: 0x3b, g: 0x82, b: 0xf6 });
  });
});
