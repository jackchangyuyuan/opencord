import type { MessagePreview } from "@opencord/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUi } from "@/stores/ui";

import { ReplyContext } from "./reply-context";
import { ReplyPreview } from "./reply-preview";

const CHANNEL_ID = "88888888-8888-4888-8888-888888888888";

function preview(overrides: Partial<MessagePreview> = {}): MessagePreview {
  return {
    id: "m-1",
    authorId: "u-ada",
    content: "the original",
    deletedAt: null,
    ...overrides,
  };
}

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app"]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  client.setQueryData(["users", "u-ada"], {
    id: "u-ada",
    username: "ada",
    name: "Ada",
    avatarUrl: null,
  });

  useUi.setState({ replyTarget: null });

  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response("{}"))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReplyContext", () => {
  it("names the people a quoted message mentioned", async () => {
    client.setQueryData(["users", "u-grace"], {
      id: "u-grace",
      username: "grace",
      name: "Grace Hopper",
      avatarUrl: null,
    });

    render(
      <ReplyContext
        channelId={CHANNEL_ID}
        replyTo={preview({ content: "hey <@u-grace> look at this" })}
      />,
      { wrapper },
    );

    expect(
      await screen.findByText(/hey @Grace Hopper look at this/),
    ).toBeInTheDocument();
  });

  it("leaves a broadcast token as the word it already is", () => {
    render(
      <ReplyContext
        channelId={CHANNEL_ID}
        replyTo={preview({ content: "@everyone ship it" })}
      />,
      { wrapper },
    );

    expect(screen.getByText(/@everyone ship it/)).toBeInTheDocument();
  });

  it("says what a marker was when its target is gone", () => {
    render(
      <ReplyContext
        channelId={CHANNEL_ID}
        replyTo={preview({ content: "see <#c-gone> and <@&r-gone>" })}
      />,
      { wrapper },
    );

    expect(screen.getByText(/see #channel and @role/)).toBeInTheDocument();
  });

  it("quotes the message being replied to", () => {
    render(<ReplyContext channelId={CHANNEL_ID} replyTo={preview()} />, {
      wrapper,
    });

    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("the original")).toBeInTheDocument();
  });

  it("renders nothing when the target was hard-deleted", () => {
    const { container } = render(
      <ReplyContext channelId={CHANNEL_ID} replyTo={null} />,
      { wrapper },
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("says so, without erroring, when the target is a tombstone", () => {
    render(
      <ReplyContext
        channelId={CHANNEL_ID}
        replyTo={preview({
          content: "",
          deletedAt: "2026-09-11T10:00:00.000Z",
        })}
      />,
      { wrapper },
    );

    expect(screen.getByText("Original message deleted")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("jumps to the quoted message", async () => {
    const user = userEvent.setup();

    render(<ReplyContext channelId={CHANNEL_ID} replyTo={preview()} />, {
      wrapper,
    });

    await user.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});

describe("ReplyPreview", () => {
  it("shows nothing without a pending reply", () => {
    const { container } = render(<ReplyPreview channelId={CHANNEL_ID} />, {
      wrapper,
    });

    expect(container).toBeEmptyDOMElement();
  });

  it("names the target of a pending reply", () => {
    useUi.setState({
      replyTarget: {
        channelId: CHANNEL_ID,
        messageId: "m-1",
        authorId: "u-ada",
        content: "the original",
      },
    });

    render(<ReplyPreview channelId={CHANNEL_ID} />, { wrapper });

    expect(screen.getByText("Replying to")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("ignores a pending reply that belongs to another channel", () => {
    useUi.setState({
      replyTarget: {
        channelId: "99999999-9999-4999-8999-999999999999",
        messageId: "m-1",
        authorId: "u-ada",
        content: "the original",
      },
    });

    const { container } = render(<ReplyPreview channelId={CHANNEL_ID} />, {
      wrapper,
    });

    expect(container).toBeEmptyDOMElement();
  });

  it("clears the pending reply", async () => {
    const user = userEvent.setup();

    useUi.setState({
      replyTarget: {
        channelId: CHANNEL_ID,
        messageId: "m-1",
        authorId: "u-ada",
        content: "the original",
      },
    });

    render(<ReplyPreview channelId={CHANNEL_ID} />, { wrapper });

    await user.click(screen.getByRole("button", { name: "Cancel reply" }));

    expect(useUi.getState().replyTarget).toBeNull();
  });
});
