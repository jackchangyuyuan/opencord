import { beforeEach, describe, expect, it } from "vitest";

import { PREFS_STORAGE_KEY, usePrefs } from "./prefs";

beforeEach(() => {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
  usePrefs.setState({ theme: "light", compact: false });
});

describe("the prefs store", () => {
  it("starts light and marks the document when the theme flips", () => {
    expect(document.documentElement).not.toHaveClass("dark");

    usePrefs.getState().toggleTheme();

    expect(usePrefs.getState().theme).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");

    usePrefs.getState().toggleTheme();

    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("writes the theme to localStorage so it survives a reload", () => {
    usePrefs.getState().setTheme("dark");

    const stored: unknown = JSON.parse(
      localStorage.getItem(PREFS_STORAGE_KEY) ?? "null",
    );

    expect(stored).toMatchObject({ state: { theme: "dark" } });
  });

  it("rehydrates the persisted theme and settles the class before a render", async () => {
    localStorage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({ state: { theme: "dark", compact: true }, version: 0 }),
    );

    await usePrefs.persist.rehydrate();

    expect(usePrefs.getState()).toMatchObject({
      theme: "dark",
      compact: true,
    });
    expect(document.documentElement).toHaveClass("dark");
  });

  it("keeps compact mode independent of the theme", () => {
    usePrefs.getState().setCompact(true);

    expect(usePrefs.getState().compact).toBe(true);
    expect(usePrefs.getState().theme).toBe("light");
  });
});
