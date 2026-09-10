import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
  ANY_DATE,
  type DateRange,
  daysAgo,
} from "@/components/data-list/date-range";
import { DateRangeFilter } from "@/components/data-list/date-range-filter";

function Harness({ onChange }: { onChange?: (next: DateRange) => void }) {
  const [range, setRange] = useState<DateRange>(ANY_DATE);

  return (
    <DateRangeFilter
      onChange={(next) => {
        setRange(next);
        onChange?.(next);
      }}
      value={range}
    />
  );
}

async function open() {
  const user = userEvent.setup();

  render(<Harness />);

  await user.click(screen.getByRole("button", { name: /Date/ }));

  return { from: await screen.findByLabelText("From"), user };
}

describe("DateRangeFilter", () => {
  it("keeps focus and the caret while a day is being finished", async () => {
    const { from, user } = await open();

    await user.click(from);
    await user.keyboard("2026-09-17");

    expect(from).toHaveFocus();
    expect(from).toHaveValue("2026-09-17");
    expect(screen.getByLabelText("From")).toBe(from);
  });

  it("keeps typing after the day is complete", async () => {
    const { from, user } = await open();

    await user.click(from);
    await user.keyboard("2026-09-17");
    await user.keyboard("{Backspace}8");

    expect(from).toHaveFocus();
    expect(from).toHaveValue("2026-09-18");
  });

  it("says nothing about a half-typed day", async () => {
    const { from, user } = await open();

    await user.click(from);
    await user.keyboard("2026-0");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains a day that is not written as one", async () => {
    const { from, user } = await open();

    await user.click(from);
    await user.keyboard("last tuesday");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dates are written YYYY-MM-DD",
    );
    expect(from).toHaveFocus();
  });

  it("explains a day that does not exist", async () => {
    const { from, user } = await open();

    await user.click(from);
    await user.keyboard("2026-02-30");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That day does not exist",
    );
  });

  it("explains a range that runs backwards", async () => {
    const { user } = await open();

    await user.click(screen.getByLabelText("From"));
    await user.keyboard("2026-09-17");
    await user.click(screen.getByLabelText("To"));
    await user.keyboard("2026-09-01");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The first date is after the last one",
    );
  });

  it("commits only a whole, real day", async () => {
    const user = userEvent.setup();
    const committed: DateRange[] = [];

    render(
      <Harness
        onChange={(next) => {
          committed.push(next);
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Date/ }));
    await user.click(await screen.findByLabelText("From"));
    await user.keyboard("2026-02-30");

    expect(committed).toEqual([]);

    await user.clear(screen.getByLabelText("From"));
    await user.keyboard("2026-09-17");

    expect(committed.at(-1)).toEqual({ from: "2026-09-17", to: null });
  });

  it("writes a preset into the boxes", async () => {
    const { user } = await open();

    await user.click(screen.getByRole("button", { name: "Today" }));

    expect(screen.getByLabelText("From")).toHaveValue(daysAgo(0));
  });
});
