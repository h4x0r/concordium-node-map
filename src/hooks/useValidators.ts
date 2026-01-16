'use client';

/**
 * Hook for fetching validator data including phantom validators
 */

import { useQuery } from '@tanstack/react-query';
import type {
  ValidatorsResponse,
  ConsensusVisibility,
  PhantomValidator,
} from '@/lib/types/validators';

/**
 * Fetch validators from API
 */
async function fetchValidators(): Promise<ValidatorsResponse> {
  const response = await fetch('/api/validators');
  if (!response.ok) {
    throw new Error(`Failed to fetch validators: ${response.status}`);
  }
  return response.json();
}

/**
 * Hook to fetch all validator data
 * Refetches every 60 seconds (less frequent than node data)
 */
export function useValidators() {
  return useQuery({
    queryKey: ['validators'],
    queryFn: fetchValidators,
    refetchInterval: 60_000, // 60 seconds
    staleTime: 30_000, // Consider data stale after 30s
    retry: 3,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook focused on consensus visibility metrics
 * Provides convenient access to visibility data and phantom list
 */
export function useConsensusVisibility(): {
  visibility: ConsensusVisibility | null;
  phantoms: PhantomValidator[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} {
  const { data, isLoading, isError, error } = useValidators();

  return {
    visibility: data?.consensusVisibility ?? null,
    phantoms: data?.phantom ?? [],
    isLoading,
    isError,
    error: error as Error | null,
  };
}

/**
 * Get quorum health color class based on stake visibility
 */
export function getVisibilityColorClass(
  stakeVisibilityPct: number
): 'positive' | 'warning' | 'negative' {
  if (stakeVisibilityPct >= 70) return 'positive';
  if (stakeVisibilityPct >= 50) return 'warning';
  return 'negative';
}

/**
 * Get quorum health color class from health status
 */
export function getHealthColorClass(
  health: 'healthy' | 'degraded' | 'critical'
): 'positive' | 'warning' | 'negative' {
  switch (health) {
    case 'healthy':
      return 'positive';
    case 'degraded':
      return 'warning';
    case 'critical':
      return 'negative';
  }
}
