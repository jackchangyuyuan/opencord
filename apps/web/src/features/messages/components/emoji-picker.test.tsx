import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EmojiPicker } from "./emoji-picker";

describe("EmojiPicker", () => {
  it("offers the curated set and reports the chosen symbol", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();

    render(<EmojiPicker onPick={onPick} />);

    await user.click(screen.getByRole("button", { name: "Add reaction" }));
    await user.click(
      await screen.findByRole("button", { name: "React with 🔥" }),
    );

    expect(onPick).toHaveBeenCalledWith("🔥");
  });

  it("closes once a symbol is chosen", async () => {
    const user = userEvent.setup();

    render(<EmojiPicker onPick={() => undefined} />);

    await user.click(screen.getByRole("button", { name: "Add reaction" }));
    await user.click(
      await screen.findByRole("button", { name: "React with 🔥" }),
    );

    expect(
      screen.queryByRole("button", { name: "React with 🔥" }),
    ).not.toBeInTheDocument();
  });
});
