import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { channelQuery } from "@/features/channels/api/queries";
import { channelOverwritesQuery } from "@/features/channels/api/queries";
import { serverQuery } from "@/features/servers/api/queries";
import { currentUserQuery } from "@/features/users/api/queries";
import { useDrafts } from "@/stores/drafts";

import { Composer } from "./composer";

const CHANNEL_ID = "33333333-3333-4333-8333-333333333333";
const SERVER_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "u-ada";

let client: QueryClient;

function seed(everyonePermissions: number) {
  client.setQueryData(currentUserQuery.queryKey, {
    id: USER_ID,
    username: "ada",
    name: "Ada",
    avatarUrl: null,
    description: null,
    customStatus: null,
    customStatusEmoji: null,
    isGuest: false,
  });

  client.setQueryData(channelQuery(CHANNEL_ID).queryKey, {
    id: CHANNEL_ID,
    serverId: SERVER_ID,
    type: "text",
    name: "general",
    topic: null,
    position: 0,
    lastMessageId: null,
    lastEveryoneMentionId: null,
    createdAt: "2026-09-11T10:00:00.000Z",
  });

  client.setQueryData(channelOverwritesQuery(CHANNEL_ID).queryKey, {
    roles: [],
    members: [],
  });

  client.setQueryData(serverQuery(SERVER_ID).queryKey, {
    id: SERVER_ID,
    name: "Analytical Engine",
    iconKey: null,
    iconUrl: null,
    ownerId: "someone-else",
    createdAt: "2026-09-11T10:00:00.000Z",
    everyoneRole: {
      id: "role-everyone",
      name: "@everyone",
      color: null,
      position: 0,
      permissions: everyonePermissions,
      isDefault: true,
    },
    roles: [],
  });
}

function renderComposer() {
  return render(
    <QueryClientProvider client={client}>
      <Composer channelId={CHANNEL_ID} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  useDrafts.setState({ byChannel: {} });
});

describe("the composer", () => {
  it("takes a message when the caller may send", () => {
    seed(Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES);

    renderComposer();

    expect(screen.getByRole("textbox", { name: "Message" })).toBeEnabled();
  });

  it("closes itself to a member who may not send, and says why", () => {
    seed(Permissions.VIEW_CHANNEL);

    renderComposer();

    const field = screen.getByRole("textbox", { name: "Message" });

    expect(field).toBeDisabled();
    expect(field).toHaveAttribute(
      "placeholder",
      "You cannot send messages in this channel",
    );
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });
});
