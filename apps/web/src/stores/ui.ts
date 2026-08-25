import { create } from "zustand";

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

interface UiState {
  activeModal: ModalName | null;
  contextMenu: ContextMenuTarget | null;
  rightPanel: RightPanel;
  mobileDrawerOpen: boolean;
  demoPanelDismissed: boolean;
  openModal: (modal: ModalName) => void;
  closeModal: () => void;
  openContextMenu: (target: ContextMenuTarget) => void;
  closeContextMenu: () => void;
  setRightPanel: (panel: RightPanel) => void;
  setMobileDrawerOpen: (open: boolean) => void;
  dismissDemoPanel: () => void;
}

export const useUi = create<UiState>()((set) => ({
  activeModal: null,
  contextMenu: null,
  rightPanel: "members",
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
  setMobileDrawerOpen: (mobileDrawerOpen) => {
    set({ mobileDrawerOpen });
  },
  dismissDemoPanel: () => {
    set({ demoPanelDismissed: true });
  },
}));
