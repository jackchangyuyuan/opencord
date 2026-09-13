import { useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMatch, useParams } from "react-router";

import { loadView, viewIsCached } from "@/features/channels/lib/load-view";
import {
  type PreparingView,
  PreparingViewContext,
  type ResolvedView,
  ResolvedViewContext,
} from "@/features/channels/lib/resolved-view";

const MAX_HOLD_MS = 2_000;

const MAX_DRAW_MS = 500;

function same(left: ResolvedView, right: ResolvedView): boolean {
  return (
    left.channelId === right.channelId &&
    left.serverId === right.serverId &&
    left.onDirectMessages === right.onDirectMessages
  );
}

export function ResolvedViewProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const params = useParams<{ channelId: string; serverId: string }>();
  const channelId = params.channelId;
  const serverId = params.serverId;
  const onDirectMessages = useMatch("/app/dms") !== null;

  const requested = useMemo<ResolvedView>(
    () => ({ channelId, serverId, onDirectMessages }),
    [channelId, onDirectMessages, serverId],
  );

  const [resolved, setResolved] = useState<ResolvedView>(requested);
  const [drawing, setDrawing] = useState<ResolvedView | null>(null);

  const arrived = same(requested, resolved);

  const redraws = requested.channelId !== resolved.channelId;

  if (arrived && drawing !== null) {
    setDrawing(null);
  }

  if (
    !arrived &&
    (drawing === null || !same(drawing, requested)) &&
    viewIsCached(queryClient, requested, resolved)
  ) {
    if (redraws) {
      setDrawing(requested);
    } else {
      setResolved(requested);
    }
  }

  useEffect(() => {
    if (arrived || (drawing !== null && same(drawing, requested))) {
      return;
    }

    let live = true;

    const ready = () => {
      if (!live) {
        return;
      }

      live = false;

      if (redraws) {
        setDrawing(requested);
      } else {
        setResolved(requested);
      }
    };

    const timer = setTimeout(ready, MAX_HOLD_MS);

    loadView(queryClient, requested, resolved)
      .catch(() => undefined)
      .finally(ready);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [arrived, drawing, redraws, requested, resolved, queryClient]);

  const drawingRef = useRef(drawing);

  drawingRef.current = drawing;

  const onDrawn = useCallback(() => {
    const destination = drawingRef.current;

    if (destination === null) {
      return;
    }

    drawingRef.current = null;
    setResolved(destination);
    setDrawing(null);
  }, []);

  useEffect(() => {
    if (drawing === null) {
      return;
    }

    const timer = setTimeout(onDrawn, MAX_DRAW_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [drawing, onDrawn]);

  const preparing = useMemo<PreparingView>(
    () => ({ view: drawing, onDrawn }),
    [drawing, onDrawn],
  );

  return (
    <ResolvedViewContext value={resolved}>
      <PreparingViewContext value={preparing}>{children}</PreparingViewContext>
    </ResolvedViewContext>
  );
}
