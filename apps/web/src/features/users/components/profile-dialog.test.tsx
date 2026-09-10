import type { PublicUser } from "@opencord/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { currentUserQuery } from "@/features/users/api/queries";
import { useUi } from "@/stores/ui";

import { ProfileDialog } from "./profile-dialog";

const ME: PublicUser = {
  id: "u-me",
  username: "jackyuan",
  name: "Jack",
  avatarUrl: null,
  description: "Computer Science @ Waterloo",
  customStatus: "working on auth",
  customStatusEmoji: "🔒",
  isGuest: false,
};

let client: QueryClient;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mount(me: PublicUser = ME, patched: () => Response = () => json(me)) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation((_input, init) =>
      Promise.resolve(init?.method === "PATCH" ? patched() : json(me)),
    );

  vi.stubGlobal("fetch", fetchMock);

  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  client.setQueryData(currentUserQuery.queryKey, me);

  render(
    <QueryClientProvider client={client}>
      <ProfileDialog />
    </QueryClientProvider>,
  );

  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof mount>): unknown {
  const call = fetchMock.mock.calls.find(
    ([, init]) => init?.method === "PATCH",
  );
  const body = call?.[1]?.body;

  return typeof body === "string" ? JSON.parse(body) : undefined;
}

beforeEach(() => {
  useUi.setState({ activeModal: "profile" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useUi.setState({ activeModal: null });
});

describe("ProfileDialog", () => {
  it("opens on the fields the profile already carries", async () => {
    mount();

    expect(await screen.findByLabelText("Display name")).toHaveValue("Jack");
    expect(screen.getByLabelText("About")).toHaveValue(
      "Computer Science @ Waterloo",
    );
    expect(screen.getByLabelText("Custom status")).toHaveValue(
      "working on auth",
    );
    expect(
      screen.getByRole("button", { name: /Status emoji: 🔒/ }),
    ).toBeVisible();
  });

  it("shows the handle as a read-only field", async () => {
    const fetchMock = mount();

    const username = await screen.findByLabelText("Username");

    expect(username).toHaveValue("jackyuan");
    expect(username).toHaveAttribute("readonly");

    await userEvent.type(username, "nope");
    expect(username).toHaveValue("jackyuan");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(sentBody(fetchMock)).not.toHaveProperty("username");
    });
  });

  it("saves an edited description", async () => {
    const fetchMock = mount();

    const about = await screen.findByLabelText("About");

    await userEvent.clear(about);
    await userEvent.type(about, "Building distributed systems.");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(sentBody(fetchMock)).toMatchObject({
        description: "Building distributed systems.",
      });
    });
  });

  it("clears the description by emptying the field", async () => {
    const fetchMock = mount(ME, () => json({ ...ME, description: null }));

    await userEvent.clear(await screen.findByLabelText("About"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(sentBody(fetchMock)).toMatchObject({ description: null });
    });
  });

  it("clears the custom status from its own action", async () => {
    const fetchMock = mount(ME, () =>
      json({ ...ME, customStatus: null, customStatusEmoji: null }),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Clear custom status" }),
    );

    expect(screen.getByLabelText("Custom status")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Pick a status emoji" }),
    ).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(sentBody(fetchMock)).toMatchObject({
        customStatus: null,
        customStatusEmoji: null,
      });
    });
  });

  it("saves the emoji chosen from the picker", async () => {
    const fetchMock = mount();

    await userEvent.click(
      await screen.findByRole("button", { name: /Status emoji: 🔒/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Use 🚀 as your status emoji",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(sentBody(fetchMock)).toMatchObject({ customStatusEmoji: "🚀" });
    });
  });

  it("drops the emoji without touching the status text", async () => {
    const fetchMock = mount();

    await userEvent.click(
      await screen.findByRole("button", { name: /Status emoji: 🔒/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove emoji" }),
    );

    expect(screen.getByLabelText("Custom status")).toHaveValue(
      "working on auth",
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(sentBody(fetchMock)).toMatchObject({
        customStatus: "working on auth",
        customStatusEmoji: null,
      });
    });
  });

  it("reflects the saved profile without a reload", async () => {
    const saved = { ...ME, description: null, customStatus: "in class" };

    mount(ME, () => json(saved));

    await userEvent.clear(await screen.findByLabelText("About"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(client.getQueryData(currentUserQuery.queryKey)).toMatchObject({
        description: null,
        customStatus: "in class",
      });
    });
  });

  it("explains a refusal rather than pretending it saved", async () => {
    mount(ME, () =>
      json({ error: { code: "VALIDATION_FAILED", message: "Too long" } }, 400),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too long");
  });
});
