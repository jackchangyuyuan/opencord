import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ModalName =
  | "create-server"
  | "create-channel"
  | "channel-settings"
  | "server-settings"
  | "profile"
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
  channelSettingsId: string | null;
  contextMenu: ContextMenuTarget | null;
  rightPanel: RightPanel;
  replyTarget: ReplyTarget | null;
  mobileDrawerOpen: boolean;
  demoPanelDismissed: boolean;
  architectureFlash: number;
  openModal: (modal: ModalName) => void;
  openChannelSettings: (channelId: string) => void;
  closeChannelSettings: () => void;
  closeModal: () => void;
  openContextMenu: (target: ContextMenuTarget) => void;
  closeContextMenu: () => void;
  setRightPanel: (panel: RightPanel) => void;
  setReplyTarget: (target: ReplyTarget | null) => void;
  setMobileDrawerOpen: (open: boolean) => void;
  dismissDemoPanel: () => void;
  flashArchitecture: () => void;
  forgetAccount: () => void;
}

export const UI_STORAGE_KEY = "opencord:ui";

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      activeModal: null,
      channelSettingsId: null,
      contextMenu: null,
      rightPanel: "members",
      replyTarget: null,
      mobileDrawerOpen: false,
      demoPanelDismissed: false,
      architectureFlash: 0,
      openModal: (activeModal) => {
        set({ activeModal });
      },
      openChannelSettings: (channelSettingsId) => {
        set({ activeModal: "channel-settings", channelSettingsId });
      },
      closeChannelSettings: () => {
        set({ activeModal: null, channelSettingsId: null });
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
      flashArchitecture: () => {
        set((state) => ({ architectureFlash: state.architectureFlash + 1 }));
      },
      forgetAccount: () => {
        set({
          activeModal: null,
          channelSettingsId: null,
          contextMenu: null,
          replyTarget: null,
          mobileDrawerOpen: false,
        });
      },
    }),
    {
      name: UI_STORAGE_KEY,
      partialize: (state) => ({ demoPanelDismissed: state.demoPanelDismissed }),
    },
  ),
);
