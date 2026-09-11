export const MESSAGE_ROW = "[data-message-row]";

const CONTROL = "button:not([disabled]), a[href]";

function elements(root: HTMLElement | null, selector: string): HTMLElement[] {
  return [...(root?.querySelectorAll<HTMLElement>(selector) ?? [])];
}

function step(
  items: HTMLElement[],
  from: HTMLElement | null,
  by: number,
): HTMLElement | undefined {
  if (items.length === 0) {
    return undefined;
  }

  const index = items.findIndex((item) => item === from || item.contains(from));

  if (index === -1) {
    return by > 0 ? items[0] : items[items.length - 1];
  }

  return items[Math.min(Math.max(index + by, 0), items.length - 1)];
}

export function moveRovingFocus(
  container: HTMLElement,
  key: string,
  active: HTMLElement | null,
): boolean {
  if (active?.tagName === "TEXTAREA" && key !== "Escape") {
    return false;
  }

  const rowList = elements(container, MESSAGE_ROW);
  const row = rowList.find(
    (entry) => entry === active || entry.contains(active),
  );

  const vertical = key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : 0;

  if (vertical !== 0) {
    const next =
      active === container
        ? rowList[rowList.length - 1]
        : step(rowList, active, vertical);

    next?.focus();
    return true;
  }

  if (key === "Home" || key === "End") {
    const edge = key === "Home" ? rowList[0] : rowList[rowList.length - 1];

    edge?.focus();
    return true;
  }

  if (row === undefined) {
    return false;
  }

  const controls = elements(row, CONTROL);
  const horizontal = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;

  if (horizontal !== 0 && controls.length > 0) {
    (active === row
      ? horizontal > 0
        ? controls[0]
        : controls[controls.length - 1]
      : step(controls, active, horizontal)
    )?.focus();

    return true;
  }

  if (key === "Escape" && active !== row) {
    row.focus();
    return true;
  }

  return false;
}
