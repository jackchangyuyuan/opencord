import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSocketConnection } from "./use-socket-connection";

const { socket, calls } = vi.hoisted(() => {
  const record: string[] = [];
  const listeners = new Map<string, ((reason: string) => void)[]>();

  return {
    calls: record,
    socket: {
      listeners,
      connect: () => {
        record.push("connect");
      },
      disconnect: () => {
        record.push("disconnect");
      },
      on: (event: string, handler: (reason: string) => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), handler]);
      },
      off: (event: string, handler: (reason: string) => void) => {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((entry) => entry !== handler),
        );
      },
      emitDisconnect: (reason: string) => {
        for (const handler of listeners.get("disconnect") ?? []) {
          handler(reason);
        }
      },
    },
  };
});

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<{ data: unknown; error: unknown }>>(),
}));

vi.mock("@/lib/socket", () => ({ socket }));
vi.mock("@/lib/auth-client", () => ({ authClient: { getSession } }));

function Probe({ userId }: { userId: string | null }) {
  useSocketConnection(userId);

  return null;
}

function renderWith(userId: string | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const wrap = (node: ReactNode) => (
    <QueryClientProvider client={client}>{node}</QueryClientProvider>
  );

  const view = render(wrap(<Probe userId={userId} />));

  return {
    rerender: (next: string | null) => {
      view.rerender(wrap(<Probe userId={next} />));
    },
  };
}

function sessionFor(userId: string) {
  return { user: { id: userId, username: userId }, session: { id: userId } };
}

beforeEach(() => {
  calls.length = 0;
  socket.listeners.clear();
  getSession.mockReset();
});

describe("useSocketConnection", () => {
  it("opens a connection for a signed-in account", () => {
    renderWith("ada");

    expect(calls).toEqual(["disconnect", "connect"]);
  });

  it("closes a connection when nobody is signed in", () => {
    renderWith(null);

    expect(calls).toEqual(["disconnect"]);
  });

  it("remakes the connection when the account changes", () => {
    const view = renderWith("ada");

    calls.length = 0;
    view.rerender("grace");

    expect(calls).toEqual(["disconnect", "connect"]);
  });

  it("leaves the connection alone while the account is the same", () => {
    const view = renderWith("ada");

    calls.length = 0;
    view.rerender("ada");

    expect(calls).toEqual([]);
  });

  it("comes back after the server closed the connection", async () => {
    getSession.mockResolvedValue({ data: sessionFor("ada"), error: null });

    renderWith("ada");
    calls.length = 0;

    socket.emitDisconnect("io server disconnect");

    await waitFor(() => {
      expect(calls).toEqual(["connect"]);
    });
  });

  it("stays closed when the session behind it is gone", async () => {
    getSession.mockResolvedValue({ data: null, error: null });

    renderWith("ada");
    calls.length = 0;

    socket.emitDisconnect("io server disconnect");

    await vi.waitFor(() => {
      expect(getSession).toHaveBeenCalled();
    });

    expect(calls).toEqual([]);
  });

  it("leaves a dropped transport to the client's own retry", () => {
    renderWith("ada");
    calls.length = 0;

    socket.emitDisconnect("transport close");

    expect(calls).toEqual([]);
    expect(getSession).not.toHaveBeenCalled();
  });
});
