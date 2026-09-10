import { createContext } from "react";

export interface ResolvedView {
  channelId: string | undefined;
  serverId: string | undefined;
  onDirectMessages: boolean;
}

export const ResolvedViewContext = createContext<ResolvedView | null>(null);

export interface PreparingView {
  view: ResolvedView | null;
  onDrawn: () => void;
}

export const PreparingViewContext = createContext<PreparingView | null>(null);
