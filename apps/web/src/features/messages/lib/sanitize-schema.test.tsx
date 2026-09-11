import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { MessageContent } from "@/features/messages/components/message-content";

const CHANNEL_ID = "44444444-4444-4444-8444-444444444444";
const SERVER_ID = "55555555-5555-4555-8555-555555555555";

function markup(
  content: string,
  seed?: (client: QueryClient) => void,
): HTMLElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });

  seed?.(client);

  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <MessageContent channelId={CHANNEL_ID} content={content} />
      </QueryClientProvider>
    </MemoryRouter>,
  );

  return screen.getByTestId("message-content");
}

function seedMentionTargets(client: QueryClient): void {
  client.setQueryData(["users", "u-ada"], {
    id: "u-ada",
    username: "ada",
    name: "Ada",
    avatarUrl: null,
  });
  client.setQueryData(["channels", CHANNEL_ID], {
    id: CHANNEL_ID,
    serverId: SERVER_ID,
    type: "text",
    name: "general",
    topic: null,
    position: 0,
    lastMessageId: null,
    lastEveryoneMentionId: null,
    createdAt: "2026-09-12T00:00:00.000Z",
  });
  client.setQueryData(
    ["servers", SERVER_ID, "roles"],
    [
      {
        id: "r-mod",
        name: "Moderator",
        color: null,
        position: 5,
        permissions: 0,
        isDefault: false,
      },
    ],
  );
}

describe("the message markdown pipeline", () => {
  it("keeps the agreed inline subset", () => {
    const root = markup("**bold** _italic_ ~~struck~~ `code`");

    expect(root.innerHTML).toContain("<strong>bold</strong>");
    expect(root.innerHTML).toContain("<em>italic</em>");
    expect(root.innerHTML).toContain("<del>struck</del>");
    expect(root.innerHTML).toContain("<code>code</code>");
  });

  it("keeps blockquotes", () => {
    expect(markup("> quoted").innerHTML).toContain("<blockquote>");
  });

  it("keeps an http link", () => {
    markup("[site](https://example.com)");

    expect(screen.getByRole("link", { name: "site" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });

  it("renders an injected img tag as text rather than an element", () => {
    const root = markup('<img src="x" onerror="alert(1)">');

    expect(root.innerHTML).not.toContain("<img");
    expect(root.innerHTML).not.toContain("onerror");
  });

  it("never lets a script tag through", () => {
    expect(markup("<script>alert(1)</script>").innerHTML).not.toContain(
      "<script",
    );
  });

  it("refuses a javascript: link target", () => {
    expect(markup("[x](javascript:alert(1))").innerHTML).not.toContain(
      "javascript:",
    );
  });

  it("lets the highlighter add hljs classes after sanitising", () => {
    const root = markup("```ts\nconst x: number = 1;\n```");

    expect(root.innerHTML).toContain("hljs");
    expect(root.innerHTML).toMatch(/class="hljs-\w+"/);
  });

  it("strips a hand-written class the schema does not allow", () => {
    const root = markup('<span class="evil">x</span>');

    expect(root.innerHTML).not.toContain("evil");
  });
});

describe("mentions inside Markdown", () => {
  function paragraphs(root: HTMLElement): number {
    return (root.innerHTML.match(/<p>/g) ?? []).length;
  }

  it("keeps a mention inside the one paragraph that surrounds it", () => {
    const root = markup("hello <@u-ada> world", seedMentionTargets);

    expect(paragraphs(root)).toBe(1);
    expect(root).toHaveTextContent("hello @Ada world");
  });

  it("names a mentioned person by their display name", () => {
    const root = markup("hello <@u-ada> world", seedMentionTargets);

    expect(root.innerHTML).toContain('title="@ada"');
    expect(root.innerHTML).not.toContain(">@ada<");
  });

  it("keeps emphasis that spans a mention", () => {
    const root = markup("**hello <@u-ada> world**", seedMentionTargets);

    expect(paragraphs(root)).toBe(1);
    expect(root.innerHTML).toMatch(
      /<strong>hello <span[^>]*>@Ada<\/span> world<\/strong>/,
    );
    expect(root).not.toHaveTextContent("*");
  });

  it("names a role from the server roles already in cache, and fills it", () => {
    const root = markup("ping <@&r-mod> please", seedMentionTargets);

    expect(root).toHaveTextContent("ping @Moderator please");
    expect(root.innerHTML).toMatch(
      /<span class="[^"]*\bbg-brand\b[^"]*">@Moderator<\/span>/,
    );
  });

  it("names a deleted role as an unknown role", () => {
    const root = markup("ping <@&r-gone> please", seedMentionTargets);

    expect(root).toHaveTextContent("ping @unknown-role please");
    expect(root.innerHTML).not.toContain("r-gone");
  });

  it("names a mentioned channel, as something you can follow", () => {
    const root = markup(`see <#${CHANNEL_ID}>`, seedMentionTargets);

    expect(root).toHaveTextContent("see #general");
    expect(
      screen.getByRole("button", { name: "#general" }),
    ).toBeInTheDocument();
  });

  it("names a channel the viewer cannot read as an unknown channel", () => {
    const root = markup("see <#66666666-6666-4666-8666-666666666666>");

    expect(root).toHaveTextContent("see #unknown-channel");
    expect(root.innerHTML).not.toContain("66666666");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("names an unresolvable user marker as an unknown user", () => {
    const root = markup("hello <@u-nobody> world");

    expect(paragraphs(root)).toBe(1);
    expect(root).toHaveTextContent("hello @unknown-user world");
    expect(root.innerHTML).not.toContain("u-nobody");
  });

  it("leaves a marker inside code alone", () => {
    const root = markup("`<@u-ada>`", seedMentionTargets);

    expect(root.innerHTML).toContain("<code>");
    expect(root).toHaveTextContent("<@u-ada>");
    expect(root.innerHTML).not.toContain("data-mention-kind");
  });
});

describe("an @everyone broadcast", () => {
  const CHIP = /<span class="[^"]*\bbg-brand\b[^"]*">([^<]*)<\/span>/;

  function chip(root: HTMLElement): string | null {
    return CHIP.exec(root.innerHTML)?.[1] ?? null;
  }

  it("highlights the token in a server channel", () => {
    const root = markup("@everyone ship it", seedMentionTargets);

    expect(chip(root)).toBe("@everyone");
    expect(root).toHaveTextContent("@everyone ship it");
  });

  it("highlights @here the same way", () => {
    const root = markup("@here quick one", seedMentionTargets);

    expect(chip(root)).toBe("@here");
  });

  it("leaves a word that merely starts with the token alone", () => {
    const root = markup("@everyones problem", seedMentionTargets);

    expect(chip(root)).toBeNull();
    expect(root).toHaveTextContent("@everyones problem");
  });

  it("leaves a domain that continues past the token alone", () => {
    const root = markup("mail@everyone.example", seedMentionTargets);

    expect(chip(root)).toBeNull();
  });

  it("leaves the token inside code alone", () => {
    const root = markup("`@everyone`", seedMentionTargets);

    expect(chip(root)).toBeNull();
    expect(root.innerHTML).toContain("<code>");
  });

  it("stays literal in a direct message", () => {
    const root = markup("@everyone hello", (client) => {
      client.setQueryData(["channels", CHANNEL_ID], {
        id: CHANNEL_ID,
        serverId: null,
        type: "dm",
        name: null,
        topic: null,
        position: 0,
        lastMessageId: null,
        lastEveryoneMentionId: null,
        createdAt: "2026-09-12T00:00:00.000Z",
      });
    });

    expect(chip(root)).toBeNull();
    expect(root).toHaveTextContent("@everyone hello");
  });
});
