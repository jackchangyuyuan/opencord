import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { currentUserQuery } from "@/features/users/api/queries";
import { usePresence } from "@/stores/presence";

import { UserAvatar } from "./user-avatar";

const ME = {
  id: "u-me",
  username: "me",
  name: "Me Myself",
  avatarUrl: null,
  description: null,
  customStatus: null,
  customStatusEmoji: null,
  isGuest: false,
};

function renderAvatar(props: Parameters<typeof UserAvatar>[0], seedMe = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  if (seedMe) {
    client.setQueryData(currentUserQuery.queryKey, ME);
  }

  return render(
    <QueryClientProvider client={client}>
      <UserAvatar {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  usePresence.getState().reset();
  usePresence.getState().setSelf("online");
});

afterEach(() => {
  usePresence.getState().reset();
});

describe("UserAvatar", () => {
  it.each([
    ["online", "Online", "bg-presence-online"],
    ["idle", "Idle", "bg-presence-idle"],
    ["dnd", "Do not disturb", "bg-presence-dnd"],
  ] as const)(
    "maps %s presence onto its own token and label",
    (status, label, tone) => {
      usePresence.getState().setStatus("u-ada", status);

      renderAvatar({ name: "Ada", userId: "u-ada" });

      const dot = screen.getByRole("img", { name: label });

      expect(dot).toBeInTheDocument();
      expect(dot).toHaveClass(tone);
    },
  );

  it("treats a user nobody has reported as offline", () => {
    renderAvatar({ name: "Ada", userId: "u-ada" });

    const dot = screen.getByRole("img", { name: "Offline" });

    expect(dot).toHaveClass("bg-presence-offline");
  });

  it("reads your own row from the status you chose", () => {
    usePresence.getState().setSelf("dnd");

    renderAvatar({ name: "Me Myself", userId: ME.id }, true);

    expect(screen.getByRole("img", { name: "Do not disturb" })).toBeVisible();
  });

  it("names presence in text, never in colour alone", () => {
    usePresence.getState().setStatus("u-ada", "idle");

    renderAvatar({ name: "Ada", userId: "u-ada" });

    expect(screen.getByRole("img")).toHaveAccessibleName("Idle");
  });

  it("falls back to initials when there is no picture", () => {
    renderAvatar({ name: "Ada Lovelace", userId: "u-ada" });

    expect(screen.getByText("AD")).toBeVisible();
  });

  it("omits the badge where presence is not the point", () => {
    renderAvatar({ name: "Ada", showPresence: false, userId: "u-ada" });

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
