import type { ServerToClientEvents } from "@opencord/shared/events";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionStatus } from "./connection-status";

type SocketEvents = ServerToClientEvents & {
  connect: () => void;
  disconnect: () => void;
};

const { listenerCount, rawEmit, reset, socket } = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;

  const listeners = new Map<string, Set<Listener>>();

  const socket = {
    connected: false,

    on: (event: string, listener: Listener) => {
      const registered = listeners.get(event) ?? new Set<Listener>();

      registered.add(listener);
      listeners.set(event, registered);
    },

    off: (event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener);
    },
  };

  return {
    socket,

    listenerCount: () =>
      [...listeners.values()].reduce((total, set) => total + set.size, 0),

    rawEmit: (event: string, ...args: unknown[]) => {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        listener(...args);
      }
    },

    reset: () => {
      listeners.clear();
      socket.connected = false;
    },
  };
});

vi.mock("../../../lib/socket", () => ({ socket }));

function emit<E extends keyof SocketEvents>(
  event: E,
  ...args: Parameters<SocketEvents[E]>
): void {
  act(() => {
    rawEmit(event, ...args);
  });
}

beforeEach(() => {
  reset();
});

describe("ConnectionStatus", () => {
  it("reports the connecting state before the socket connects", () => {
    render(<ConnectionStatus />);

    expect(screen.getByText("connecting")).toBeInTheDocument();
  });

  it("reports the connected state when the socket is already connected at mount", () => {
    socket.connected = true;

    render(<ConnectionStatus />);

    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("names the serving instance once the connection is ready", () => {
    render(<ConnectionStatus />);

    emit("connect");

    expect(screen.getByText("connected")).toBeInTheDocument();

    emit("connection:ready", { instanceId: "api-2" });

    expect(screen.getByText("connected · api-2")).toBeInTheDocument();
  });

  it("drops the instance when the socket disconnects", () => {
    render(<ConnectionStatus />);

    emit("connect");
    emit("connection:ready", { instanceId: "api-2" });

    expect(screen.getByText("connected · api-2")).toBeInTheDocument();

    emit("disconnect");

    expect(screen.getByText("disconnected")).toBeInTheDocument();
  });

  it("unsubscribes from the socket when unmounted", () => {
    const { unmount } = render(<ConnectionStatus />);

    expect(listenerCount()).toBe(3);

    unmount();

    expect(listenerCount()).toBe(0);
  });
});
