import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClaimPrompt } from "@/features/demo/components/claim-prompt";
import { useUi } from "@/stores/ui";

import { ClaimDialog } from "./claim-dialog";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const guest = vi.hoisted(() => ({
  anonymous: true,
  createdAt: new Date(),
  guestExpiresAt: new Date(),
}));

function lifetime(elapsedMs: number, remainingMs: number) {
  const now = Date.now();

  guest.createdAt = new Date(now - elapsedMs);
  guest.guestExpiresAt = new Date(now + remainingMs);
}

vi.mock("@/features/auth/hooks/use-session", () => ({
  sessionQueryKey: ["session"],
  useSession: () => ({
    session: { user: { id: "u-guest" } },
    user: {
      id: "u-guest",
      isAnonymous: guest.anonymous,
      createdAt: guest.createdAt,
      guestExpiresAt: guest.guestExpiresAt,
    },
    isPending: false,
  }),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mount(post: () => Response) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation((_input, init) =>
      Promise.resolve(init?.method === "POST" ? post() : json({})),
    );

  vi.stubGlobal("fetch", fetchMock);

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <label htmlFor="composer">Message</label>
      <input id="composer" />
      <ClaimPrompt />
      <ClaimDialog />
    </QueryClientProvider>,
  );

  return fetchMock;
}

async function fillTheForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Username"), "ada");
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Password"), "correct horse battery");
}

beforeEach(() => {
  guest.anonymous = true;
  lifetime(HOUR, 3 * HOUR);
  useUi.setState({ activeModal: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ClaimDialog", () => {
  it("rejects a short password with the shared schema, before any request", async () => {
    const user = userEvent.setup();
    const fetchMock = mount(() => json({}, 200));

    useUi.setState({ activeModal: "claim-account" });

    await user.type(await screen.findByLabelText("Username"), "ada");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Save my account" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Password")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });

    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
  });

  it("posts the claim and closes on success", async () => {
    const user = userEvent.setup();
    const fetchMock = mount(() =>
      json({
        id: "u-guest",
        email: "ada@example.com",
        username: "ada",
        name: "ada",
      }),
    );

    useUi.setState({ activeModal: "claim-account" });

    await fillTheForm(user);
    await user.click(screen.getByRole("button", { name: "Save my account" }));

    await waitFor(() => {
      expect(useUi.getState().activeModal).toBeNull();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/demo/claim",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("puts a taken email on the field that owns it", async () => {
    const user = userEvent.setup();

    mount(() =>
      json(
        { error: { code: "EMAIL_TAKEN", message: "That email is taken" } },
        409,
      ),
    );

    useUi.setState({ activeModal: "claim-account" });

    await fillTheForm(user);
    await user.click(screen.getByRole("button", { name: "Save my account" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Email")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });

    expect(useUi.getState().activeModal).toBe("claim-account");
  });
});

describe("ClaimPrompt", () => {
  it("stays away while most of the session is left", () => {
    mount(() => json({}));

    expect(screen.queryByTestId("claim-prompt")).not.toBeInTheDocument();
  });

  it("shows nothing to a registered visitor", () => {
    guest.anonymous = false;
    lifetime(3 * HOUR + 50 * MINUTE, 10 * MINUTE);

    mount(() => json({}));

    expect(screen.queryByTestId("claim-prompt")).not.toBeInTheDocument();
  });

  it("appears under a quarter of the lifetime without taking focus", async () => {
    lifetime(3 * HOUR + 50 * MINUTE, 10 * MINUTE);

    mount(() => json({}));

    const composer = screen.getByLabelText("Message");

    composer.focus();

    expect(await screen.findByTestId("claim-prompt")).toBeVisible();
    expect(composer).toHaveFocus();
  });
});
