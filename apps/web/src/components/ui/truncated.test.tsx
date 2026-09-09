import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { Truncated } from "@/components/ui/truncated";

const original = {
  clientWidth: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth",
  ),
  scrollWidth: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollWidth",
  ),
};

function layout({ scroll, client }: { scroll: number; client: number }) {
  Object.defineProperties(HTMLElement.prototype, {
    scrollWidth: { configurable: true, value: scroll },
    clientWidth: { configurable: true, value: client },
  });
}

afterEach(() => {
  if (original.scrollWidth !== undefined) {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollWidth",
      original.scrollWidth,
    );
  }

  if (original.clientWidth !== undefined) {
    Object.defineProperty(
      HTMLElement.prototype,
      "clientWidth",
      original.clientWidth,
    );
  }
});

const LONG = "Bartholomew Featherstonehaugh-Cholmondeley the Third";

function copies(value: string): number {
  return screen.queryAllByText(value).length;
}

describe("Truncated", () => {
  it("stays plain text, with nothing to open, when the value fits", async () => {
    const user = userEvent.setup();

    layout({ scroll: 100, client: 100 });

    render(<Truncated value="Ada" />);

    await user.hover(screen.getByText("Ada"));
    await user.tab();

    expect(copies("Ada")).toBe(1);
  });

  it("treats a single pixel of difference as a fit", async () => {
    const user = userEvent.setup();

    layout({ scroll: 101, client: 100 });

    render(<Truncated value="Ada" />);

    await user.hover(screen.getByText("Ada"));

    expect(copies("Ada")).toBe(1);
  });

  it("offers the whole value on hover once it is clipped", async () => {
    const user = userEvent.setup();

    layout({ scroll: 400, client: 100 });

    render(<Truncated value={LONG} />);

    expect(copies(LONG)).toBe(1);

    await user.hover(screen.getByText(LONG));

    await waitFor(
      () => {
        expect(copies(LONG)).toBeGreaterThan(1);
      },
      { timeout: 3000 },
    );
  });

  it("offers the whole value on keyboard focus", async () => {
    const user = userEvent.setup();

    layout({ scroll: 400, client: 100 });

    render(<Truncated value={LONG} />);

    await user.tab();

    expect(copies(LONG)).toBeGreaterThan(1);
  });
});
