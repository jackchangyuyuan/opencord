import type { Message } from "@opencord/shared/types";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  channelMessagesQuery,
  channelMessagesQueryKey,
  type MessageCache,
} from "@/features/messages/api/queries";
import { insertOptimistic } from "@/features/messages/lib/cache";

const CHANNEL = "11111111-1111-4111-8111-111111111111";

function message(id: string, nonce: string | null = null): Message {
  return {
    id,
    channelId: CHANNEL,
    authorId: "22222222-2222-4222-8222-222222222222",
    content: `message ${id}`,
    nonce,
    replyToId: null,
    replyTo: null,
    pinnedAt: null,
    pinnedBy: null,
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-09-15T10:00:00.000Z",
    reactions: [],
    attachments: [],
  };
}

function page(entries: Message[]): MessageCache {
  return {
    pages: [{ data: entries, nextCursor: null }],
    pageParams: [null],
  };
}

function clientHoldingAPage(entries: Message[]): QueryClient {
  const queryClient = new QueryClient();

  const { structuralSharing } = channelMessagesQuery(CHANNEL);

  queryClient.setQueryDefaults(
    channelMessagesQueryKey(CHANNEL),
    structuralSharing === undefined ? {} : { structuralSharing },
  );
  queryClient.setQueryData<MessageCache>(
    channelMessagesQueryKey(CHANNEL),
    page(entries),
  );

  return queryClient;
}

function held(queryClient: QueryClient): Message[] {
  return (
    queryClient.getQueryData<MessageCache>(
      channelMessagesQueryKey(CHANNEL),
    ) ?? { pages: [], pageParams: [] }
  ).pages.flatMap((entry) => entry.data);
}

describe("the message cache's structural sharing", () => {
  it("keeps every existing message's identity across an insert at the front", () => {
    const older = [message("m-3"), message("m-2"), message("m-1")];
    const queryClient = clientHoldingAPage(older);
    const before = held(queryClient);

    queryClient.setQueryData<MessageCache>(
      channelMessagesQueryKey(CHANNEL),
      (cache) => insertOptimistic(cache, message("optimistic:n", "n")),
    );

    const after = held(queryClient);

    expect(after).toHaveLength(4);
    expect(after[0]?.id).toBe("optimistic:n");
    expect(after[1]).toBe(before[0]);
    expect(after[2]).toBe(before[1]);
    expect(after[3]).toBe(before[2]);
  });

  it("replaces a confirmed message without disturbing its neighbours", () => {
    const queryClient = clientHoldingAPage([
      message("optimistic:n", "n"),
      message("m-2"),
      message("m-1"),
    ]);
    const before = held(queryClient);

    queryClient.setQueryData<MessageCache>(
      channelMessagesQueryKey(CHANNEL),
      (cache) => ({
        ...(cache as MessageCache),
        pages: [
          {
            nextCursor: null,
            data: [
              { ...message("m-4", "n"), content: "message optimistic:n" },
              message("m-2"),
              message("m-1"),
            ],
          },
        ],
      }),
    );

    const after = held(queryClient);

    expect(after[0]?.id).toBe("m-4");
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[2]);
  });

  it("hands back the cache it already had when nothing changed", () => {
    const queryClient = clientHoldingAPage([message("m-2"), message("m-1")]);
    const before = queryClient.getQueryData<MessageCache>(
      channelMessagesQueryKey(CHANNEL),
    );

    queryClient.setQueryData<MessageCache>(
      channelMessagesQueryKey(CHANNEL),
      () => page([message("m-2"), message("m-1")]),
    );

    expect(
      queryClient.getQueryData<MessageCache>(channelMessagesQueryKey(CHANNEL)),
    ).toBe(before);
  });

  it("takes the new object when a message's own content changed", () => {
    const queryClient = clientHoldingAPage([message("m-2"), message("m-1")]);
    const before = held(queryClient);

    queryClient.setQueryData<MessageCache>(
      channelMessagesQueryKey(CHANNEL),
      () =>
        page([
          { ...message("m-2"), content: "edited", editedAt: "2026-09-15T11" },
          message("m-1"),
        ]),
    );

    const after = held(queryClient);

    expect(after[0]?.content).toBe("edited");
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });
});
