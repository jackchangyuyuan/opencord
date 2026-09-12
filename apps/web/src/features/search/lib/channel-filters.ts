import type { ChannelSummary } from "@/features/channels/api/queries";
import { chipsOf } from "@/features/search/lib/filters";

export function resolveChannelFilters(
  raw: string,
  channels: readonly ChannelSummary[],
  picked: ReadonlyMap<string, string>,
): string[] {
  const byName = new Map(
    channels
      .filter((channel) => channel.name !== null)
      .map((channel) => [(channel.name ?? "").toLowerCase(), channel.id]),
  );

  const ids = new Set<string>();

  for (const chip of chipsOf(raw)) {
    if (chip.key !== "in") {
      continue;
    }

    const name = chip.value.toLowerCase();
    const id = picked.get(name) ?? byName.get(name);

    if (id !== undefined) {
      ids.add(id);
    }
  }

  return [...ids];
}
