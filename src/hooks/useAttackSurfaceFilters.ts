/**
 * Attack Surface Filters Hook
 *
 * Zustand store for managing filter and sort state in the Attack Surface view.
 * Separates UI state from data fetching concerns.
 */

import { create } from 'zustand';
import type { FilterMode, RiskFilter, SortColumn, SortDirection } from '@/lib/attack-surface';

interface AttackSurfaceFiltersState {
  // Filter state
  filterMode: FilterMode;
  riskFilter: RiskFilter;
  searchTerm: string;

  // Sort state
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  validatorsFirst: boolean;

  // Actions
  setFilterMode: (mode: FilterMode) => void;
  setRiskFilter: (risk: RiskFilter) => void;
  setSearchTerm: (term: string) => void;
  toggleSort: (column: SortColumn) => void;
  toggleValidatorsFirst: () => void;
  resetFilters: () => void;
}

const initialState = {
  filterMode: 'all' as FilterMode,
  riskFilter: 'all' as RiskFilter,
  searchTerm: '',
  sortColumn: 'risk' as SortColumn,
  sortDirection: 'desc' as SortDirection,
  validatorsFirst: false,
};

export const useAttackSurfaceFilters = create<AttackSurfaceFiltersState>((set) => ({
  ...initialState,

  setFilterMode: (mode) => set({ filterMode: mode }),

  setRiskFilter: (risk) => set({ riskFilter: risk }),

  setSearchTerm: (term) => set({ searchTerm: term }),

  toggleSort: (column) =>
    set((state) => {
      if (state.sortColumn === column) {
        // Toggle direction if same column
        return {
          sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc',
        };
      }
      // New column, start with ascending
      return {
        sortColumn: column,
        sortDirection: 'asc',
      };
    }),

  toggleValidatorsFirst: () =>
    set((state) => ({
      validatorsFirst: !state.validatorsFirst,
    })),

  resetFilters: () => set(initialState),
}));
