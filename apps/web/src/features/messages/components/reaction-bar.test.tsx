import type { Message } from "@opencord/shared/types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { applyReaction } from "@/features/realtime/lib/apply-message-event";

import { applyToggle } from "../hooks/use-toggle-reaction";
import { ReactionBar } from "./reaction-bar";

function message(reactions: Message["reactions"]): Message["reactions"] {
  return reactions;
}

describe("ReactionBar", () => {
  it("groups the reactions and marks the caller's own", () => {
    render(
      <ReactionBar
        onToggle={() => undefined}
        reactions={message([
          { emoji: "👍", count: 2, me: true },
          { emoji: "🎉", count: 1, me: false },
        ])}
      />,
    );

    expect(screen.getByRole("button", { name: "👍 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "🎉 1" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("toggles off a reaction the caller already holds", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <ReactionBar
        onToggle={onToggle}
        reactions={message([{ emoji: "👍", count: 2, me: true }])}
      />,
    );

    await user.click(screen.getByRole("button", { name: "👍 2" }));

    expect(onToggle).toHaveBeenCalledWith("👍", false);
  });

  it("toggles on a reaction the caller does not hold", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <ReactionBar
        onToggle={onToggle}
        reactions={message([{ emoji: "👍", count: 1, me: false }])}
      />,
    );

    await user.click(screen.getByRole("button", { name: "👍 1" }));

    expect(onToggle).toHaveBeenCalledWith("👍", true);
  });

  it("offers the curated picker", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(<ReactionBar onToggle={onToggle} reactions={message([])} />);

    await user.click(screen.getByRole("button", { name: "Add reaction" }));
    await user.click(
      await screen.findByRole("button", { name: "React with 🔥" }),
    );

    expect(onToggle).toHaveBeenCalledWith("🔥", true);
  });

  it("renders no reaction list at all when a message has none", () => {
    render(<ReactionBar onToggle={() => undefined} reactions={message([])} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add reaction" }),
    ).toBeInTheDocument();
  });

  it("shows but does not offer reactions without the permission", () => {
    render(
      <ReactionBar
        disabled
        onToggle={() => undefined}
        reactions={message([{ emoji: "👍", count: 1, me: false }])}
      />,
    );

    expect(screen.getByRole("button", { name: "👍 1" })).toBeDisabled();
  });
});

describe("applyToggle", () => {
  it("adds the caller to an existing reaction exactly once", () => {
    const once = applyToggle(
      [{ emoji: "👍", count: 1, me: false }],
      "👍",
      true,
    );

    expect(once).toEqual([{ emoji: "👍", count: 2, me: true }]);
    expect(applyToggle(once, "👍", true)).toEqual(once);
  });

  it("creates the reaction when nobody holds it", () => {
    expect(applyToggle([], "🔥", true)).toEqual([
      { emoji: "🔥", count: 1, me: true },
    ]);
  });

  it("drops the reaction when the caller was its only holder", () => {
    expect(
      applyToggle([{ emoji: "🔥", count: 1, me: true }], "🔥", false),
    ).toEqual([]);
  });

  it("leaves other holders behind when the caller removes theirs", () => {
    expect(
      applyToggle([{ emoji: "🔥", count: 3, me: true }], "🔥", false),
    ).toEqual([{ emoji: "🔥", count: 2, me: false }]);
  });

  it("is a no-op when the caller does not hold the reaction", () => {
    const reactions = [{ emoji: "🔥", count: 2, me: false }];

    expect(applyToggle(reactions, "🔥", false)).toEqual(reactions);
  });
});

describe("applyReaction", () => {
  it("does not double-count another user's arrival", () => {
    expect(
      applyReaction([{ emoji: "👍", count: 1, me: true }], "👍", true, false),
    ).toEqual([{ emoji: "👍", count: 2, me: true }]);
  });

  it("keeps the caller's own flag when someone else leaves", () => {
    expect(
      applyReaction([{ emoji: "👍", count: 2, me: true }], "👍", false, false),
    ).toEqual([{ emoji: "👍", count: 1, me: true }]);
  });

  it("clears the caller's flag when the caller's own row is removed", () => {
    expect(
      applyReaction([{ emoji: "👍", count: 2, me: true }], "👍", false, true),
    ).toEqual([{ emoji: "👍", count: 1, me: false }]);
  });

  it("ignores a removal for a reaction nobody holds", () => {
    expect(applyReaction([], "👍", false, true)).toEqual([]);
  });
});
