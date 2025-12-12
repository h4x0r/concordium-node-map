import { create } from 'zustand';

export type ViewType = 'topology' | 'geographic';

interface AppState {
  // State
  selectedNodeId: string | null;
  currentView: ViewType;
  isPanelOpen: boolean;

  // Actions
  selectNode: (nodeId: string | null) => void;
  setView: (view: ViewType) => void;
  togglePanel: () => void;
  closePanel: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  selectedNodeId: null,
  currentView: 'topology',
  isPanelOpen: false,

  // Actions
  selectNode: (nodeId) =>
    set({
      selectedNodeId: nodeId,
      isPanelOpen: nodeId !== null,
    }),

  setView: (view) => set({ currentView: view }),

  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

  closePanel: () =>
    set({
      isPanelOpen: false,
      selectedNodeId: null,
    }),
}));
