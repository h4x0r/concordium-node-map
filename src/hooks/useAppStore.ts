import { create } from 'zustand';

export type ViewType = 'topology' | 'geographic';

interface AppState {
  // State
  selectedNodeId: string | null;
  currentView: ViewType;
  isPanelOpen: boolean;
  isDeepDiveOpen: boolean;
  isHelpOpen: boolean;

  // Actions
  selectNode: (nodeId: string | null) => void;
  setView: (view: ViewType) => void;
  togglePanel: () => void;
  closePanel: () => void;
  openDeepDive: () => void;
  closeDeepDive: () => void;
  openHelp: () => void;
  closeHelp: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  selectedNodeId: null,
  currentView: 'topology',
  isPanelOpen: false,
  isDeepDiveOpen: false,
  isHelpOpen: false,

  // Actions
  selectNode: (nodeId) =>
    set({
      selectedNodeId: nodeId,
      isPanelOpen: nodeId !== null,
      isDeepDiveOpen: false,
    }),

  setView: (view) => set({ currentView: view }),

  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

  closePanel: () =>
    set({
      isPanelOpen: false,
      selectedNodeId: null,
      isDeepDiveOpen: false,
    }),

  openDeepDive: () => set({ isDeepDiveOpen: true }),

  closeDeepDive: () => set({ isDeepDiveOpen: false }),

  openHelp: () => set({ isHelpOpen: true }),

  closeHelp: () => set({ isHelpOpen: false }),
}));
