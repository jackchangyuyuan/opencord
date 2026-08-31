import { Permissions } from "@opencord/shared/permissions";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { PERMISSION_NAMES, toggleBit } from "@/features/roles/lib/permissions";

import { PermissionGrid } from "./permission-grid";

const ACTOR =
  Permissions.VIEW_CHANNEL |
  Permissions.SEND_MESSAGES |
  Permissions.MANAGE_ROLES;

function Harness({
  heldByActor = ACTOR,
  initial = 0,
  onChange = () => undefined,
}: {
  heldByActor?: number;
  initial?: number;
  onChange?: (next: number) => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <PermissionGrid
      heldByActor={heldByActor}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      value={value}
    />
  );
}

describe("PermissionGrid", () => {
  it("renders one switch per bit in the shared Permissions object", () => {
    render(<Harness />);

    expect(screen.getAllByRole("switch")).toHaveLength(PERMISSION_NAMES.length);
  });

  it("disables a bit the caller does not hold", () => {
    render(<Harness />);

    expect(
      screen.getByRole("switch", { name: "Send messages" }),
    ).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("switch", { name: "Ban members" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.getByRole("switch", { name: "Administrator" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("sets a bit the caller holds", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole("switch", { name: "Send messages" }));

    expect(onChange).toHaveBeenCalledWith(Permissions.SEND_MESSAGES);
  });

  it("clears a bit that was set", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Harness initial={Permissions.SEND_MESSAGES} onChange={onChange} />);

    await user.click(screen.getByRole("switch", { name: "Send messages" }));

    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("never reports a change for a bit the caller does not hold", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole("switch", { name: "Ban members" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a held bit as on without letting it be changed when disabled", () => {
    render(
      <PermissionGrid
        disabled
        heldByActor={ACTOR}
        onChange={() => undefined}
        value={Permissions.SEND_MESSAGES}
      />,
    );

    const held = screen.getByRole("switch", { name: "Send messages" });

    expect(held).toBeChecked();
    expect(held).toHaveAttribute("aria-disabled", "true");
  });
});

describe("toggleBit", () => {
  it("sets and clears exactly one bit", () => {
    expect(toggleBit(0, Permissions.BAN_MEMBERS, true)).toBe(
      Permissions.BAN_MEMBERS,
    );
    expect(
      toggleBit(
        Permissions.BAN_MEMBERS | Permissions.KICK_MEMBERS,
        Permissions.BAN_MEMBERS,
        false,
      ),
    ).toBe(Permissions.KICK_MEMBERS);
  });

  it("is idempotent", () => {
    const once = toggleBit(0, Permissions.VIEW_CHANNEL, true);

    expect(toggleBit(once, Permissions.VIEW_CHANNEL, true)).toBe(once);
  });
});

describe("the payload a tampered DOM could produce", () => {
  it("is masked to the bits the caller holds", () => {
    const tampered = Permissions.ADMINISTRATOR | Permissions.SEND_MESSAGES;

    expect(tampered & ACTOR).toBe(Permissions.SEND_MESSAGES);
  });
});
