'use client';

import { useMemo } from 'react';
import { useAttackSurface } from '@/hooks/useAttackSurface';
import { useAttackSurfaceFilters } from '@/hooks/useAttackSurfaceFilters';
import { useAppStore } from '@/hooks/useAppStore';
import { filterAttackSurfaceNodes, sortAttackSurfaceNodes } from '@/lib/attack-surface';
import { AttackSurfaceStatsHeader } from './AttackSurfaceStatsHeader';
import { AttackSurfaceFilters } from './AttackSurfaceFilters';
import { AttackSurfaceTable } from './AttackSurfaceTable';

/**
 * Attack Surface view showing nodes, IPs, and open ports discovered via OSINT.
 *
 * This component is an orchestrator that:
 * 1. Fetches data via useAttackSurface hook
 * 2. Manages filter/sort state via useAttackSurfaceFilters Zustand store
 * 3. Applies filtering and sorting via pure functions
 * 4. Delegates rendering to sub-components
 */
export function AttackSurfaceView() {
  const { nodes, stats, isLoading, osintError } = useAttackSurface();
  const { selectNode } = useAppStore();

  // Filter and sort state from Zustand store
  const {
    filterMode,
    riskFilter,
    searchTerm,
    sortColumn,
    sortDirection,
    validatorsFirst,
    setFilterMode,
    setRiskFilter,
    setSearchTerm,
    toggleSort,
    toggleValidatorsFirst,
  } = useAttackSurfaceFilters();

  // Apply filtering and sorting using pure functions
  const filteredAndSortedNodes = useMemo(() => {
    const filtered = filterAttackSurfaceNodes(nodes, filterMode, riskFilter, searchTerm);
    return sortAttackSurfaceNodes(filtered, {
      column: sortColumn,
      direction: sortDirection,
      validatorsFirst,
    });
  }, [nodes, filterMode, riskFilter, searchTerm, sortColumn, sortDirection, validatorsFirst]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--bb-black)]">
        <span className="text-[var(--bb-gray)]">LOADING ATTACK SURFACE...</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-[var(--bb-black)] text-[var(--bb-text)]">
      {/* Header with stats */}
      <AttackSurfaceStatsHeader stats={stats} />

      {/* OSINT error banner */}
      {osintError && (
        <div className="px-4 py-2 bg-[var(--bb-red)] bg-opacity-20 text-[var(--bb-red)] text-xs">
          ⚠️ {osintError}
        </div>
      )}

      {/* Filter controls */}
      <AttackSurfaceFilters
        stats={stats}
        filterMode={filterMode}
        riskFilter={riskFilter}
        searchTerm={searchTerm}
        validatorsFirst={validatorsFirst}
        onFilterModeChange={setFilterMode}
        onRiskFilterChange={setRiskFilter}
        onSearchTermChange={setSearchTerm}
        onToggleValidatorsFirst={toggleValidatorsFirst}
      />

      {/* Data table with footer legend */}
      <AttackSurfaceTable
        nodes={filteredAndSortedNodes}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={toggleSort}
        onNodeSelect={selectNode}
      />
    </div>
  );
}
