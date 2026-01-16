import { create } from 'zustand';
import type { NodeTier, NodeHealth } from '@/lib/transforms';
import type { NodeFilterCriteria } from '@/lib/node-filters';

interface NodeFilterState extends NodeFilterCriteria {
  showPhantoms: boolean;
  toggleTier: (tier: NodeTier) => void;
  toggleHealth: (health: NodeHealth) => void;
  togglePhantoms: () => void;
  clearFilters: () => void;
  hasActiveFilters: () => boolean;
}

export const useNodeFilter = create<NodeFilterState>((set, get) => ({
  tiers: [],
  health: [],
  showPhantoms: false,

  toggleTier: (tier) =>
    set((state) => ({
      tiers: state.tiers.includes(tier)
        ? state.tiers.filter((t) => t !== tier)
        : [...state.tiers, tier],
    })),

  toggleHealth: (health) =>
    set((state) => ({
      health: state.health.includes(health)
        ? state.health.filter((h) => h !== health)
        : [...state.health, health],
    })),

  togglePhantoms: () =>
    set((state) => ({
      showPhantoms: !state.showPhantoms,
    })),

  clearFilters: () => set({ tiers: [], health: [], showPhantoms: false }),

  hasActiveFilters: () => {
    const state = get();
    return state.tiers.length > 0 || state.health.length > 0 || state.showPhantoms;
  },
}));
