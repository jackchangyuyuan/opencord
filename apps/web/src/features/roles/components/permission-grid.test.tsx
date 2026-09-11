import { Permissions } from "@opencord/shared/permissions";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  CHANNEL_PERMISSION_NAMES,
  PERMISSION_NAMES,
  ROLE_PERMISSION_GROUPS,
  toggleBit,
  UNGROUPED_PERMISSIONS,
} from "@/features/roles/lib/permissions";

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

describe("the role grid's scope framing", () => {
  it("names the access bit for the server, not for a channel", () => {
    render(<Harness />);

    expect(
      screen.getByRole("switch", { name: "View channels" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: "View channel" }),
    ).not.toBeInTheDocument();
  });

  it("groups the bits by what they are permission to do", () => {
    render(<Harness />);

    for (const group of ROLE_PERMISSION_GROUPS) {
      expect(screen.getByText(group.title)).toBeInTheDocument();
    }
  });

  it("leaves no permission out of a group", () => {
    expect(UNGROUPED_PERMISSIONS).toEqual([]);
  });

  it("explains scope only where the name does not", () => {
    render(<Harness />);

    expect(
      screen.getByText(
        "Grants every permission and ignores channel overrides.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.queryByText(/A channel can override it/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/joins a server, not a channel/),
    ).not.toBeInTheDocument();
  });

  it("offers every bit here, and only the channel-scoped ones per channel", () => {
    expect(PERMISSION_NAMES).toHaveLength(12);
    expect(CHANNEL_PERMISSION_NAMES).toHaveLength(7);
    expect(CHANNEL_PERMISSION_NAMES).not.toContain("CREATE_INVITE");
    expect(CHANNEL_PERMISSION_NAMES).not.toContain("ADMINISTRATOR");
    expect(CHANNEL_PERMISSION_NAMES).toContain("VIEW_CHANNEL");
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
