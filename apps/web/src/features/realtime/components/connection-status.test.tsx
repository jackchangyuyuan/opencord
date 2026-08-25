import type { ServerToClientEvents } from "@opencord/shared/events";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SocketEvents = ServerToClientEvents & {
  connect: () => void;
  disconnect: () => void;
};

const { rawEmit, reset, socket } = vi.hoisted(() => {
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

    rawEmit: (event: string, ...args: unknown[]) => {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        listener(...args);
      }
    },

    reset: () => {
      socket.connected = false;
    },
  };
});

vi.mock("@/lib/socket", () => ({ socket }));

const { ConnectionStatus } = await import("./connection-status");
const { useConnection } = await import("@/stores/connection");

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
  useConnection.setState({ status: "connecting", instanceId: null });
});

describe("ConnectionStatus", () => {
  it("reports the connecting state before the socket connects", () => {
    render(<ConnectionStatus />);

    expect(screen.getByText("connecting")).toBeInTheDocument();
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

  it("renders an instance the store learned before this component mounted", () => {
    emit("connect");
    emit("connection:ready", { instanceId: "api-1" });

    render(<ConnectionStatus />);

    expect(screen.getByText("connected · api-1")).toBeInTheDocument();
  });
});
