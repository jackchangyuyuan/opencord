import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { SearchField } from "@/components/data-list/search-field";
import type { Identity } from "@/lib/identity";

const PEOPLE: Identity[] = [
  { id: "u-ada", username: "ada", name: "Ada Lovelace" },
  { id: "u-konrad", username: "konrad", name: "Konrad Zuse" },
  { id: "u-grace", username: "grace", name: "Grace Hopper" },
];

function Harness({
  onEscape,
  suggest,
}: {
  onEscape?: () => void;
  suggest?: Identity[];
}) {
  const [value, setValue] = useState("");

  return (
    <div
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onEscape?.();
        }
      }}
    >
      <SearchField
        label="Search members by @username or name"
        onChange={setValue}
        placeholder="Search members…"
        suggest={suggest}
        value={value}
      />
    </div>
  );
}

function field() {
  return screen.getByRole("combobox", {
    name: "Search members by @username or name",
  });
}

describe("SearchField", () => {
  it("offers exactly one clear control", async () => {
    const user = userEvent.setup();

    render(<Harness suggest={PEOPLE} />);

    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();

    await user.type(field(), "ada");

    expect(
      screen.getAllByRole("button", { name: "Clear search" }),
    ).toHaveLength(1);
  });

  it("clears the box and hands focus back", async () => {
    const user = userEvent.setup();

    render(<Harness suggest={PEOPLE} />);

    await user.type(field(), "ada");
    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(field()).toHaveValue("");
    expect(field()).toHaveFocus();
  });

  it("stays quiet until an @ is typed", async () => {
    const user = userEvent.setup();

    render(<Harness suggest={PEOPLE} />);

    await user.type(field(), "ada");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.clear(field());
    await user.type(field(), "@ad");

    expect(
      within(screen.getByRole("listbox")).getByText("@ada"),
    ).toBeInTheDocument();
  });

  it("completes to the exact handle when one is chosen", async () => {
    const user = userEvent.setup();

    render(<Harness suggest={PEOPLE} />);

    await user.type(field(), "@ad");
    await user.click(screen.getByText("@ada"));

    expect(field()).toHaveValue("@ada");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("walks the list with the arrows and takes one with Enter", async () => {
    const user = userEvent.setup();

    render(<Harness suggest={PEOPLE} />);

    await user.type(field(), "@");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(field()).toHaveValue("@grace");
  });

  it("announces itself as a combobox over the option list", async () => {
    const user = userEvent.setup();

    render(<Harness suggest={PEOPLE} />);

    expect(field()).toHaveAttribute("aria-expanded", "false");

    await user.type(field(), "@ad");

    expect(field()).toHaveAttribute("aria-expanded", "true");
    expect(field()).toHaveAttribute("aria-autocomplete", "list");
    expect(field()).toHaveAttribute(
      "aria-controls",
      screen.getByRole("listbox").id,
    );
  });

  it("dismisses the list, then the text, then lets the dialog have it", async () => {
    const user = userEvent.setup();
    const onEscape = vi.fn();

    render(<Harness onEscape={onEscape} suggest={PEOPLE} />);

    await user.type(field(), "@ad");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(field()).toHaveValue("@ad");
    expect(onEscape).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");

    expect(field()).toHaveValue("");
    expect(onEscape).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("is an ordinary searchbox with no candidates to offer", () => {
    render(<Harness />);

    expect(
      screen.getByRole("searchbox", {
        name: "Search members by @username or name",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
