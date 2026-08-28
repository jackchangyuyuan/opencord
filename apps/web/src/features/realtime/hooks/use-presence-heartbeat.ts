import { useEffect, useRef } from "react";

import { socket } from "@/lib/socket";
import { usePresence } from "@/stores/presence";

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const IDLE_AFTER_MS = 5 * 60_000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel"] as const;

export function usePresenceHeartbeat(): void {
  const self = usePresence((state) => state.self);
  const lastActiveRef = useRef(0);

  useEffect(() => {
    lastActiveRef.current = Date.now();

    const markActive = () => {
      lastActiveRef.current = Date.now();
    };

    const isIdle = (): boolean =>
      document.visibilityState !== "visible" ||
      Date.now() - lastActiveRef.current >= IDLE_AFTER_MS;

    const beat = () => {
      socket.emit("presence:heartbeat", {
        status: self,
        idle: self === "idle" || isIdle(),
      });
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActive, { passive: true });
    }

    document.addEventListener("visibilitychange", beat);
    socket.on("connect", beat);

    beat();

    const beating = setInterval(beat, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(beating);

      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActive);
      }

      document.removeEventListener("visibilitychange", beat);
      socket.off("connect", beat);
    };
  }, [self]);
}
