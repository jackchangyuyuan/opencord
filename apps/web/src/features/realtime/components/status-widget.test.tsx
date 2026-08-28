import type { ServerToClientEvents } from "@opencord/shared/events";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InstanceStats } from "@/features/realtime/api/stats";

type SocketEvents = ServerToClientEvents & {
  connect: () => void;
  disconnect: () => void;
};

const { rawEmit, socket } = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;

  const listeners = new Map<string, Set<Listener>>();

  return {
    socket: {
      connected: false,

      on: (event: string, listener: Listener) => {
        const registered = listeners.get(event) ?? new Set<Listener>();

        registered.add(listener);
        listeners.set(event, registered);
      },

      off: (event: string, listener: Listener) => {
        listeners.get(event)?.delete(listener);
      },
    },

    rawEmit: (event: string, ...args: unknown[]) => {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        listener(...args);
      }
    },
  };
});

vi.mock("@/lib/socket", () => ({ socket }));

const { StatusWidget } = await import("./status-widget");
const { useConnection } = await import("@/stores/connection");

function emit<E extends keyof SocketEvents>(
  event: E,
  ...args: Parameters<SocketEvents[E]>
): void {
  act(() => {
    rawEmit(event, ...args);
  });
}

function stubStats(stats: InstanceStats) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolve(new Response(JSON.stringify(stats)));
        }),
    ),
  );
}

function renderWidget() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <StatusWidget />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useConnection.setState({ status: "connecting", instanceId: null });

  stubStats({
    instanceId: "api-2",
    sockets: 7,
    onlineUsers: 3,
    uptimeSeconds: 42,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StatusWidget", () => {
  it("reports the connecting state with no instance yet", () => {
    renderWidget();

    expect(screen.getByText("Connecting")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("names the instance the socket reported", () => {
    renderWidget();

    emit("connect");
    emit("connection:ready", { instanceId: "api-1" });

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("api-1")).toBeInTheDocument();
  });

  it("follows the socket when it reconnects to a different instance", () => {
    renderWidget();

    emit("connect");
    emit("connection:ready", { instanceId: "api-1" });

    expect(screen.getByText("api-1")).toBeInTheDocument();

    emit("disconnect");

    expect(screen.getByText("Disconnected")).toBeInTheDocument();

    emit("connect");
    emit("connection:ready", { instanceId: "api-2" });

    expect(screen.getByText("api-2")).toBeInTheDocument();
  });

  it("never takes the instance from the load-balanced stats route", async () => {
    renderWidget();

    emit("connect");
    emit("connection:ready", { instanceId: "api-1" });

    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();

    expect(screen.getByText("api-1")).toBeInTheDocument();
    expect(screen.queryByText("api-2")).not.toBeInTheDocument();
  });

  it("renders the counts as placeholders until stats arrive", () => {
    renderWidget();

    emit("connect");
    emit("connection:ready", { instanceId: "api-1" });

    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
