import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ConcordiumNode } from '@/lib/transforms';

async function fetchNodes(): Promise<ConcordiumNode[]> {
  const response = await fetch('/api/nodes');
  if (!response.ok) {
    throw new Error(`Failed to fetch nodes: ${response.status}`);
  }
  return response.json();
}

export function useNodes() {
  return useQuery({
    queryKey: ['nodes'],
    queryFn: fetchNodes,
    refetchInterval: 30_000, // 30 seconds
    staleTime: 10_000, // Consider fresh for 10s
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
  });
}

export interface NetworkMetrics {
  totalNodes: number;
  avgPeers: number;
  maxFinalizationLag: number;
  consensusParticipation: number;
}

export function useNetworkMetrics() {
  const { data: nodes, isLoading, isError, dataUpdatedAt } = useNodes();

  const metrics = useMemo<NetworkMetrics | null>(() => {
    if (!nodes || nodes.length === 0) return null;

    const totalNodes = nodes.length;

    // Average peer count
    const totalPeers = nodes.reduce((sum, node) => sum + node.peersCount, 0);
    const avgPeers = Math.round(totalPeers / totalNodes);

    // Finalization lag (max blocks behind the highest)
    const heights = nodes.map((n) => n.finalizedBlockHeight);
    const maxHeight = Math.max(...heights);
    const minHeight = Math.min(...heights);
    const maxFinalizationLag = maxHeight - minHeight;

    // Consensus participation (% of nodes that are bakers)
    const bakers = nodes.filter(
      (n) => n.bakingCommitteeMember === 'ActiveInCommittee' && n.consensusBakerId !== null
    );
    const consensusParticipation = Math.round((bakers.length / totalNodes) * 100);

    return {
      totalNodes,
      avgPeers,
      maxFinalizationLag,
      consensusParticipation,
    };
  }, [nodes]);

  return {
    metrics,
    isLoading,
    isError,
    dataUpdatedAt,
  };
}
