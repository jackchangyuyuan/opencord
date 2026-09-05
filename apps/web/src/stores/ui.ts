import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ModalName =
  | "create-server"
  | "create-channel"
  | "channel-settings"
  | "server-settings"
  | "claim-account";

export interface ContextMenuTarget {
  kind: "message" | "channel" | "member";
  id: string;
  x: number;
  y: number;
}

export type RightPanel = "members" | "search" | null;

export interface ReplyTarget {
  channelId: string;
  messageId: string;
  authorId: string;
  content: string;
}

interface UiState {
  activeModal: ModalName | null;
  contextMenu: ContextMenuTarget | null;
  rightPanel: RightPanel;
  replyTarget: ReplyTarget | null;
  mobileDrawerOpen: boolean;
  demoPanelDismissed: boolean;
  openModal: (modal: ModalName) => void;
  closeModal: () => void;
  openContextMenu: (target: ContextMenuTarget) => void;
  closeContextMenu: () => void;
  setRightPanel: (panel: RightPanel) => void;
  setReplyTarget: (target: ReplyTarget | null) => void;
  setMobileDrawerOpen: (open: boolean) => void;
  dismissDemoPanel: () => void;
}

export const UI_STORAGE_KEY = "opencord:ui";

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      activeModal: null,
      contextMenu: null,
      rightPanel: "members",
      replyTarget: null,
      mobileDrawerOpen: false,
      demoPanelDismissed: false,
      openModal: (activeModal) => {
        set({ activeModal });
      },
      closeModal: () => {
        set({ activeModal: null });
      },
      openContextMenu: (contextMenu) => {
        set({ contextMenu });
      },
      closeContextMenu: () => {
        set({ contextMenu: null });
      },
      setRightPanel: (rightPanel) => {
        set({ rightPanel });
      },
      setReplyTarget: (replyTarget) => {
        set({ replyTarget });
      },
      setMobileDrawerOpen: (mobileDrawerOpen) => {
        set({ mobileDrawerOpen });
      },
      dismissDemoPanel: () => {
        set({ demoPanelDismissed: true });
      },
    }),
    {
      name: UI_STORAGE_KEY,
      partialize: (state) => ({ demoPanelDismissed: state.demoPanelDismissed }),
    },
  ),
);
