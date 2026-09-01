import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InviteLanding } from "./invite-landing";

const CODE = "AbCdEfGh";
const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const CHANNEL_ID = "88888888-8888-4888-8888-888888888888";

interface Outcome {
  status: number;
  body: unknown;
}

let previewOutcome: Outcome;
let redeemOutcome: Outcome;

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: { method?: string }) => {
      if (url.endsWith("/channels")) {
        return Promise.resolve(
          new Response(JSON.stringify([{ id: CHANNEL_ID }])),
        );
      }

      if (url.endsWith("/servers")) {
        return Promise.resolve(new Response("[]"));
      }

      const outcome = init?.method === "POST" ? redeemOutcome : previewOutcome;

      return Promise.resolve(
        new Response(JSON.stringify(outcome.body), {
          status: outcome.status,
        }),
      );
    }),
  );
}

function renderLanding() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/invite/${CODE}`]}>
        <Routes>
          <Route element={<InviteLanding />} path="/invite/:code" />
          <Route element={<p>the app</p>} path="/app/channels/:channelId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function apiError(code: string, message: string): Outcome["body"] {
  return { error: { code, message } };
}

beforeEach(() => {
  previewOutcome = {
    status: 200,
    body: {
      code: CODE,
      server: { id: SERVER_ID, name: "Analytical Engine", iconKey: null },
      memberCount: 3,
    },
  };

  redeemOutcome = { status: 200, body: { serverId: SERVER_ID } };

  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InviteLanding", () => {
  it("previews the server before joining", async () => {
    renderLanding();

    expect(await screen.findByText("Analytical Engine")).toBeInTheDocument();
    expect(screen.getByText("3 members")).toBeInTheDocument();
  });

  it("navigates into the server's first channel on success", async () => {
    const user = userEvent.setup();

    renderLanding();

    await user.click(
      await screen.findByRole("button", { name: "Accept invite" }),
    );

    expect(await screen.findByText("the app")).toBeInTheDocument();
  });

  it("gives a banned user its own copy", async () => {
    const user = userEvent.setup();

    redeemOutcome = {
      status: 403,
      body: apiError("USER_BANNED", "You are banned from that server"),
    };

    renderLanding();

    await user.click(
      await screen.findByRole("button", { name: "Accept invite" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You cannot join this server",
    );
  });

  it("gives an exhausted invite different copy", async () => {
    const user = userEvent.setup();

    redeemOutcome = {
      status: 409,
      body: apiError("INVITE_EXHAUSTED", "That invite is no longer usable"),
    };

    renderLanding();

    await user.click(
      await screen.findByRole("button", { name: "Accept invite" }),
    );

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent("This invite is no longer usable");
    expect(alert).not.toHaveTextContent("You cannot join this server");
  });

  it("explains an unknown code without offering to join", async () => {
    previewOutcome = {
      status: 404,
      body: apiError("INVITE_NOT_FOUND", "That invite does not exist"),
    };

    renderLanding();

    expect(
      await screen.findByText("That invite does not exist"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept invite" }),
    ).not.toBeInTheDocument();
  });
});
