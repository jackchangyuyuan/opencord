import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicUser } from "@/features/members/api/queries";
import { usePresence } from "@/stores/presence";

import { DmMemberList } from "./dm-member-list";

const PARTICIPANTS: PublicUser[] = [
  { id: "u-ada", username: "ada", name: "Ada Lovelace", avatarUrl: null },
  { id: "u-grace", username: "grace", name: "Grace Hopper", avatarUrl: null },
];

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <DmMemberList channelId="c-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  usePresence.getState().reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DmMemberList", () => {
  it("lists every participant the conversation reports", async () => {
    const fetchMock = stubFetch(PARTICIPANTS);

    renderPanel();

    expect(await screen.findByText("Ada Lovelace")).toBeVisible();
    expect(screen.getByText("Grace Hopper")).toBeVisible();
    expect(screen.getByText("@ada")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/channels/c-1/members",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("carries each participant's presence", async () => {
    stubFetch(PARTICIPANTS);
    usePresence.getState().setStatus("u-grace", "dnd");

    renderPanel();

    expect(await screen.findByText("Grace Hopper")).toBeVisible();
    expect(screen.getByLabelText("Do not disturb")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Offline")).toHaveLength(1);
  });

  it("reports a failure rather than rendering an empty roster", async () => {
    stubFetch({ error: { code: "OFFLINE", message: "no" } }, 503);

    renderPanel();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load the participants.",
    );
  });
});
