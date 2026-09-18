import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";

import { sessionQueryKey } from "@/features/auth/hooks/use-session";
import { channelMessagesQueryKey } from "@/features/messages/api/queries";
import { useDrafts } from "@/stores/drafts";
import { usePresence } from "@/stores/presence";
import { useTyping } from "@/stores/typing";
import { useUi } from "@/stores/ui";

import { watchIdentity } from "./identity";

const CHANNEL_ID = "88888888-8888-4888-8888-888888888888";

function session(userId: string) {
  return { user: { id: userId }, session: { id: `s-${userId}` } };
}

let client: QueryClient;
let stop: () => void;

function seedAccountState(): void {
  client.setQueryData(channelMessagesQueryKey(CHANNEL_ID), {
    pages: [{ data: [{ id: "m-1" }], nextCursor: null }],
    pageParams: [null],
  });

  useDrafts.getState().setDraft(CHANNEL_ID, "half a sentence");
  useUi.getState().setReplyTarget({
    channelId: CHANNEL_ID,
    messageId: "m-1",
    authorId: "u-ada",
    content: "answered",
  });
  useTyping.getState().start(CHANNEL_ID, "u-grace");
  usePresence.getState().setStatus("u-grace", "idle");
}

function accountStateIsEmpty(): boolean {
  return (
    client.getQueryData(channelMessagesQueryKey(CHANNEL_ID)) === undefined &&
    useDrafts.getState().byChannel[CHANNEL_ID] === undefined &&
    useUi.getState().replyTarget === null &&
    useTyping.getState().byChannel[CHANNEL_ID] === undefined &&
    usePresence.getState().byUser["u-grace"] === undefined
  );
}

beforeEach(() => {
  useDrafts.getState().reset();
  useUi.getState().forgetAccount();
  useTyping.getState().reset();
  usePresence.getState().reset();

  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  stop = watchIdentity(client);
});

describe("watchIdentity", () => {
  it("keeps what the first answer belongs to", () => {
    client.setQueryData(sessionQueryKey, session("u-ada"));
    seedAccountState();

    expect(accountStateIsEmpty()).toBe(false);

    stop();
  });

  it.each([
    ["a sign-out and a different account", [null, session("u-grace")]],
    ["a replacement session with no sign-out", [session("u-grace")]],
    ["a revoked or expired session", [null]],
  ])("empties the previous account's state on %s", (_case, transitions) => {
    client.setQueryData(sessionQueryKey, session("u-ada"));
    seedAccountState();

    for (const next of transitions) {
      client.setQueryData(sessionQueryKey, next);
    }

    expect(accountStateIsEmpty()).toBe(true);

    stop();
  });

  it("keeps everything when a guest claims the account they are already in", () => {
    client.setQueryData(sessionQueryKey, session("u-visitor"));
    seedAccountState();

    client.setQueryData(sessionQueryKey, {
      user: { id: "u-visitor", username: "ada", isAnonymous: false },
      session: { id: "s-u-visitor" },
    });

    expect(accountStateIsEmpty()).toBe(false);

    stop();
  });

  it("stops listening once it is unsubscribed", () => {
    client.setQueryData(sessionQueryKey, session("u-ada"));
    seedAccountState();

    stop();

    client.setQueryData(sessionQueryKey, null);

    expect(accountStateIsEmpty()).toBe(false);
  });
});
