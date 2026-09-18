import { Permissions } from "@opencord/shared/permissions";
import type { PublicUser } from "@opencord/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { channelQuery } from "@/features/channels/api/queries";
import { channelOverwritesQuery } from "@/features/channels/api/queries";
import { serverQuery } from "@/features/servers/api/queries";
import { currentUserQuery } from "@/features/users/api/queries";
import { useDrafts } from "@/stores/drafts";

import { Composer } from "./composer";

function member(
  username: string,
  name: string,
  nickname: string | null = null,
) {
  const user: PublicUser = {
    id: `u-${username}`,
    username,
    name,
    avatarUrl: null,
    description: null,
    customStatus: null,
    customStatusEmoji: null,
    isGuest: false,
  };

  return { user, nickname, joinedAt: "2026-09-01T00:00:00.000Z", roleIds: [] };
}

const ROSTER = [
  member("jackyuan", "Jack"),
  member("janet", "Jack"),
  member("jacqueline", "Jacqueline Ng"),
  member("grace", "Grace Hopper"),
];

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
    description: null,
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
    viewerRoles: [],
  });
}

function renderComposer() {
  return render(
    <QueryClientProvider client={client}>
      <Composer channelId={CHANNEL_ID} />
    </QueryClientProvider>,
  );
}

function stubMembers(data = ROSTER) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const roster = url.includes("/members");

    return Promise.resolve(
      new Response(
        JSON.stringify(
          roster
            ? { data, nextCursor: null }
            : { error: { code: "OFFLINE", message: "not stubbed" } },
        ),
        {
          status: roster ? 200 : 503,
          headers: { "content-type": "application/json" },
        },
      ),
    );
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}

function options(): string[] {
  return screen.getAllByRole("option").map((option) => option.textContent);
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  useDrafts.setState({ byChannel: {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
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

describe("mention autocomplete", () => {
  async function open(text = "@") {
    seed(Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES);
    stubMembers();
    renderComposer();

    const field = screen.getByRole("textbox", { name: "Message" });

    await userEvent.click(field);
    await userEvent.type(field, text);

    return field;
  }

  it("opens on @ and lists the members of the server", async () => {
    await open();

    expect(
      await screen.findByRole("listbox", { name: "Mentions" }),
    ).toBeVisible();
    await waitFor(() => {
      expect(options()).toHaveLength(ROSTER.length);
    });
  });

  it("filters as the term is typed", async () => {
    await open("@jacq");

    await waitFor(() => {
      expect(options()).toHaveLength(1);
    });
    expect(options()[0]).toContain("@jacqueline");
  });

  it("ranks a handle prefix ahead of a display-name match", async () => {
    await open("@ja");

    await waitFor(() => {
      expect(options().length).toBeGreaterThan(2);
    });

    expect(options()[0]).toContain("@jackyuan");
  });

  it("tells duplicate display names apart by handle", async () => {
    await open("@jack");

    await waitFor(() => {
      expect(options()).toHaveLength(2);
    });

    expect(options().join(" ")).toContain("@jackyuan");
    expect(options().join(" ")).toContain("@janet");
  });

  it("moves the selection with the arrow keys", async () => {
    const field = await open("@ja");

    await waitFor(() => {
      expect(options().length).toBeGreaterThan(1);
    });

    const first = screen.getAllByRole("option")[0];

    expect(first).toHaveAttribute("aria-selected", "true");
    expect(field).toHaveAttribute("aria-activedescendant", first?.id ?? "");

    await userEvent.keyboard("{ArrowDown}");

    const second = screen.getAllByRole("option")[1];

    expect(second).toHaveAttribute("aria-selected", "true");
    expect(field).toHaveAttribute("aria-activedescendant", second?.id ?? "");

    await userEvent.keyboard("{ArrowUp}");

    expect(screen.getAllByRole("option")[0]).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("wraps around the ends of the list", async () => {
    await open("@ja");

    await waitFor(() => {
      expect(options().length).toBe(3);
    });

    await userEvent.keyboard("{ArrowUp}");

    expect(screen.getAllByRole("option")[2]).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("accepts the selection with Enter instead of sending", async () => {
    const field = await open("hello @ja");

    await waitFor(() => {
      expect(options().length).toBeGreaterThan(0);
    });

    await userEvent.keyboard("{Enter}");

    expect(field).toHaveValue("hello @jackyuan ");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("accepts the selection with Tab", async () => {
    const field = await open("@gr");

    await waitFor(() => {
      expect(options().length).toBe(1);
    });

    await userEvent.keyboard("{Tab}");

    expect(field).toHaveValue("@grace ");
  });

  it("accepts a suggestion with the mouse and keeps focus in the field", async () => {
    const field = await open("@ja");

    await waitFor(() => {
      expect(options().length).toBeGreaterThan(0);
    });

    await userEvent.click(screen.getAllByRole("option")[1] ?? field);

    expect(field).toHaveValue("@jacqueline ");
    expect(field).toHaveFocus();
  });

  it("replaces only the partial mention and keeps typing where it left off", async () => {
    const field = await open("see @ja");

    await waitFor(() => {
      expect(options().length).toBeGreaterThan(0);
    });

    await userEvent.keyboard("{Enter}");
    await userEvent.type(field, "about it");

    expect(field).toHaveValue("see @jackyuan about it");
  });

  it("closes on Escape and stays closed for that term", async () => {
    const field = await open("@ja");

    await waitFor(() => {
      expect(options().length).toBeGreaterThan(0);
    });

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await userEvent.type(field, "c");

    expect(await screen.findByRole("listbox")).toBeVisible();
  });

  it("never offers you yourself", async () => {
    seed(Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES);
    stubMembers([...ROSTER, member("ada", "Ada")]);
    renderComposer();

    const field = screen.getByRole("textbox", { name: "Message" });

    await userEvent.click(field);
    await userEvent.type(field, "@ad");

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  it("stays shut for an @ inside a word", async () => {
    const field = await open("mail ada@example");

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
    expect(field).toHaveValue("mail ada@example");
  });

  it("stays mounted while a new term is in flight", async () => {
    seed(Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES);

    let release: () => void = () => {
      throw new Error("nothing is being held open yet");
    };

    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = typeof input === "string" ? input : (input as Request).url;

      if (!url.includes("/members")) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { code: "OFFLINE" } }), {
            status: 503,
            headers: { "content-type": "application/json" },
          }),
        );
      }

      const answer = () =>
        new Response(JSON.stringify({ data: ROSTER, nextCursor: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });

      if (!url.includes("q=")) {
        return Promise.resolve(answer());
      }

      return new Promise<Response>((resolve) => {
        release = () => {
          resolve(answer());
        };
      });
    });

    vi.stubGlobal("fetch", fetchMock);
    renderComposer();

    const field = screen.getByRole("textbox", { name: "Message" });

    await userEvent.click(field);
    await userEvent.type(field, "@");

    const menu = await screen.findByRole("listbox", { name: "Mentions" });

    await userEvent.type(field, "ja");

    expect(screen.getByRole("listbox", { name: "Mentions" })).toBe(menu);
    expect(options().length).toBeGreaterThan(0);

    release();

    await waitFor(() => {
      expect(options()).toHaveLength(3);
    });
    expect(screen.getByRole("listbox", { name: "Mentions" })).toBe(menu);
  });

  it("offers @everyone to a member who may broadcast", async () => {
    seed(
      Permissions.VIEW_CHANNEL |
        Permissions.SEND_MESSAGES |
        Permissions.MENTION_EVERYONE,
    );
    stubMembers();
    renderComposer();

    const field = screen.getByRole("textbox", { name: "Message" });

    await userEvent.click(field);
    await userEvent.type(field, "@every");

    await waitFor(() => {
      expect(options()).toHaveLength(1);
    });
    expect(options()[0]).toContain("@everyone");

    await userEvent.keyboard("{Enter}");

    expect(field).toHaveValue("@everyone ");
  });

  it("leaves Enter to the input method while it is composing", async () => {
    seed(Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES);
    const fetchMock = stubMembers();

    renderComposer();

    const field = screen.getByRole("textbox", { name: "Message" });

    await userEvent.click(field);
    await userEvent.type(field, "@ja");

    await waitFor(() => {
      expect(options().length).toBeGreaterThan(0);
    });

    fireEvent.keyDown(field, { key: "Enter", isComposing: true });

    expect(field).toHaveValue("@ja");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        urlOf(input).includes("/messages"),
      ),
    ).toHaveLength(0);
  });

  it("withholds @everyone from a member who may not broadcast", async () => {
    await open("@every");

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  it("filters a nickname the roster shows rather than the account name", async () => {
    seed(Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES);
    stubMembers([member("grace", "Grace Hopper", "Amazing Grace")]);
    renderComposer();

    const field = screen.getByRole("textbox", { name: "Message" });

    await userEvent.click(field);
    await userEvent.type(field, "@amaz");

    await waitFor(() => {
      expect(options()).toHaveLength(1);
    });
    expect(options()[0]).toContain("Amazing Grace");
    expect(field).toHaveValue("@amaz");
  });
});
