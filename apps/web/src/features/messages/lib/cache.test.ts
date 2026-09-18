import type { Message } from "@opencord/shared/types";
import { describe, expect, it } from "vitest";

import type { MessageCache } from "@/features/messages/api/queries";
import {
  applyIncoming,
  type ChatMessage,
  insertOptimistic,
  optimisticId,
} from "@/features/messages/lib/cache";
import { applyMessageEvent } from "@/features/realtime/lib/apply-message-event";

const CHANNEL_ID = "11111111-1111-4111-8111-111111111111";

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    channelId: CHANNEL_ID,
    authorId: "u-ada",
    content: id,
    nonce: null,
    replyToId: null,
    replyTo: null,
    pinnedAt: null,
    pinnedBy: null,
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-09-11T10:00:00.000Z",
    reactions: [],
    attachments: [],
    ...overrides,
  };
}

function cacheOf(
  pages: { ids: string[]; nextCursor?: string | null }[],
): MessageCache {
  return {
    pages: pages.map((page) => ({
      data: page.ids.map((id) => message(id)),
      nextCursor: page.nextCursor ?? null,
    })),
    pageParams: pages.map(() => null),
  };
}

function idsOf(cache: MessageCache | undefined): string[][] {
  return (cache?.pages ?? []).map((page) => page.data.map((entry) => entry.id));
}

describe("a message arriving out of order", () => {
  it("lands in the page whose range holds it, not at the front", () => {
    const cache = cacheOf([
      { ids: ["m-09", "m-08"], nextCursor: "c" },
      { ids: ["m-05", "m-03"] },
    ]);

    expect(idsOf(applyIncoming(cache, message("m-04")))).toEqual([
      ["m-09", "m-08"],
      ["m-05", "m-04", "m-03"],
    ]);
  });

  it("lands between two pages at the front of the older one", () => {
    const cache = cacheOf([
      { ids: ["m-09", "m-08"], nextCursor: "c" },
      { ids: ["m-05", "m-03"] },
    ]);

    expect(idsOf(applyIncoming(cache, message("m-07")))).toEqual([
      ["m-09", "m-08"],
      ["m-07", "m-05", "m-03"],
    ]);
  });

  it("takes the front of the newest page when it is the newest message", () => {
    const cache = cacheOf([
      { ids: ["m-09", "m-08"], nextCursor: "c" },
      { ids: ["m-05", "m-03"] },
    ]);

    expect(idsOf(applyIncoming(cache, message("m-11")))[0]).toEqual([
      "m-11",
      "m-09",
      "m-08",
    ]);
  });

  it("is left for the page that has not been read yet", () => {
    const cache = cacheOf([{ ids: ["m-05", "m-03"], nextCursor: "c" }]);

    expect(idsOf(applyIncoming(cache, message("m-01")))).toEqual([
      ["m-05", "m-03"],
    ]);
  });

  it("takes the end of the last page when that page is the start of the channel", () => {
    const cache = cacheOf([{ ids: ["m-05", "m-03"] }]);

    expect(idsOf(applyIncoming(cache, message("m-01")))).toEqual([
      ["m-05", "m-03", "m-01"],
    ]);
  });
});

describe("an optimistic row being confirmed", () => {
  it("is placed by the id the server gave it rather than where it sat", () => {
    const pending: ChatMessage = {
      ...message(optimisticId("n-1"), { nonce: "n-1" }),
      local: {
        status: "sending",
        retry: "same-nonce",
        reason: null,
        source: "hello",
        attachments: [],
      },
    };

    const cache = applyIncoming(
      insertOptimistic(cacheOf([{ ids: ["m-05"] }]), pending),
      message("m-07"),
    );

    expect(idsOf(cache)[0]).toEqual([optimisticId("n-1"), "m-07", "m-05"]);

    const confirmed = applyIncoming(
      cache,
      message("m-06", { nonce: "n-1", content: "hello" }),
    );

    expect(idsOf(confirmed)[0]).toEqual(["m-07", "m-06", "m-05"]);
    expect(
      (confirmed.pages[0]?.data[1] as ChatMessage | undefined)?.local,
    ).toBeUndefined();
  });
});

describe("what an edit answers for", () => {
  it("leaves the quoted copy alone when the edit is too old for the message", () => {
    const cache: MessageCache = {
      pages: [
        {
          data: [
            {
              ...message("m-02"),
              replyToId: "m-01",
              replyTo: {
                id: "m-01",
                authorId: "u-ada",
                content: "current",
                deletedAt: null,
              },
            },
            message("m-01", {
              content: "current",
              editedAt: "2026-09-11T12:00:00.000Z",
            }),
          ],
          nextCursor: null,
        },
      ],
      pageParams: [null],
    };

    const next = applyMessageEvent(cache, {
      type: "update",
      message: message("m-01", {
        content: "outdated",
        editedAt: "2026-09-11T11:00:00.000Z",
      }),
    });

    expect(next?.pages[0]?.data[1]?.content).toBe("current");
    expect(next?.pages[0]?.data[0]?.replyTo?.content).toBe("current");
  });

  it("still reaches the quoted copy when the edit is the newer one", () => {
    const cache: MessageCache = {
      pages: [
        {
          data: [
            {
              ...message("m-02"),
              replyToId: "m-01",
              replyTo: {
                id: "m-01",
                authorId: "u-ada",
                content: "before",
                deletedAt: null,
              },
            },
            message("m-01", { content: "before" }),
          ],
          nextCursor: null,
        },
      ],
      pageParams: [null],
    };

    const next = applyMessageEvent(cache, {
      type: "update",
      message: message("m-01", {
        content: "after",
        editedAt: "2026-09-11T11:00:00.000Z",
      }),
    });

    expect(next?.pages[0]?.data[1]?.content).toBe("after");
    expect(next?.pages[0]?.data[0]?.replyTo?.content).toBe("after");
  });
});

describe("a fetched page against a reaction that arrived since", () => {
  const seeded = cacheOf([{ ids: ["m-01"] }]);

  it("keeps the reaction the socket applied after the page was asked for", () => {
    const askedAt = 1000;

    const reacted = applyMessageEvent(seeded, {
      type: "reaction",
      add: true,
      payload: {
        channelId: CHANNEL_ID,
        messageId: "m-01",
        userId: "u-ada",
        emoji: "👍",
      },
      viewerId: "u-ada",
      at: askedAt + 1,
    });

    const answered = applyIncoming(reacted, message("m-01"), {
      source: "fetch",
      askedAt,
    });

    expect(answered.pages[0]?.data[0]?.reactions).toEqual([
      { emoji: "👍", count: 1, me: true },
    ]);
  });

  it("takes the snapshot when nothing has happened since it was asked for", () => {
    const answered = applyIncoming(
      seeded,
      message("m-01", { reactions: [{ emoji: "🎉", count: 2, me: false }] }),
      { source: "fetch", askedAt: 1000 },
    );

    expect(answered.pages[0]?.data[0]?.reactions).toEqual([
      { emoji: "🎉", count: 2, me: false },
    ]);
  });
});
