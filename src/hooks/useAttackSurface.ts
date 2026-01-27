/**
 * Attack Surface Data Hook
 *
 * Fetches and aggregates attack surface data from nodes, peers, and OSINT.
 * Business logic is delegated to pure functions in lib/attack-surface.
 */

import { useMemo } from 'react';
import { useNodes } from './useNodes';
import { usePeers } from './usePeers';
import { useQuery } from '@tanstack/react-query';
import type { OsintFullResponse } from '@/app/api/osint/route';
import {
  assessRisk,
  categorizePorts,
  type AttackSurfaceNode,
  type AttackSurfaceStats,
  type OsintReputation,
  type RiskLevel,
} from '@/lib/attack-surface';

/**
 * Fetch OSINT data for a specific IP
 */
async function fetchOsintData(ip: string): Promise<OsintFullResponse | null> {
  try {
    const response = await fetch(`/api/osint?ip=${encodeURIComponent(ip)}&mode=full`);
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch (error) {
    console.error(`Failed to fetch OSINT for ${ip}:`, error);
    return null;
  }
}

/**
 * Hook return type
 */
export interface UseAttackSurfaceResult {
  nodes: AttackSurfaceNode[];
  stats: AttackSurfaceStats;
  isLoading: boolean;
  osintError: string | null;
  getNodeAttackSurface: (nodeId: string) => AttackSurfaceNode | null;
}

/**
 * Hook to aggregate attack surface data from nodes, peers, and OSINT
 */
export function useAttackSurface(): UseAttackSurfaceResult {
  const { data: nodes, isLoading: nodesLoading } = useNodes();
  const { peers, isLoading: peersLoading } = usePeers();

  // Build a map of node IDs to peer data
  const peerMap = useMemo(() => {
    const map = new Map<string, (typeof peers)[0]>();
    peers.forEach((peer) => {
      map.set(peer.peerId, peer);
    });
    return map;
  }, [peers]);

  // Get all unique IPs that need OSINT lookup
  const ipsToLookup = useMemo(() => {
    const ips = new Set<string>();
    peers.forEach((peer) => {
      if (peer.ipAddress) {
        ips.add(peer.ipAddress);
      }
    });
    return Array.from(ips);
  }, [peers]);

  // Fetch OSINT data for all IPs
  // Note: InternetDB updates on a scanning cycle (days/weeks), not real-time
  // Our database cache is 24 hours, so we only need to refetch when cache expires
  const {
    data: osintData,
    isLoading: osintLoading,
    error: osintFetchError,
  } = useQuery({
    queryKey: ['attack-surface-osint', ipsToLookup],
    queryFn: async () => {
      const results = await Promise.all(
        ipsToLookup.map(async (ip) => {
          const data = await fetchOsintData(ip);
          return { ip, data };
        })
      );

      const map = new Map<string, OsintFullResponse>();
      results.forEach(({ ip, data }) => {
        if (data) {
          map.set(ip, data);
        }
      });
      return map;
    },
    enabled: ipsToLookup.length > 0,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - match database cache TTL
    refetchInterval: false, // No automatic refetch - rely on cache expiry
    refetchOnWindowFocus: false, // Don't refetch when user returns to tab
  });

  // Aggregate all data into attack surface nodes
  const attackSurfaceNodes = useMemo<AttackSurfaceNode[]>(() => {
    if (!nodes) return [];

    return nodes.map((node) => {
      const peer = peerMap.get(node.nodeId);
      const ipAddress = peer?.ipAddress ?? null;
      const port = peer?.port ?? null;
      const isValidator = node.consensusBakerId !== null;

      // Get OSINT data for this IP
      const osint = ipAddress && osintData ? osintData.get(ipAddress) : null;
      const osintPorts = osint?.ports ?? [];
      const osintVulns = osint?.vulns ?? [];
      const osintTags = osint?.tags ?? [];
      const osintReputation = (osint?.reputation ?? 'unknown') as OsintReputation;
      const osintLastScan = osint?.cached_at ?? null;

      // Categorize ports using pure function
      const portCategories = categorizePorts(osintPorts);

      // Assess risk using pure function
      const riskResult = assessRisk({
        osintPorts,
        osintVulns,
        osintReputation,
        isValidator,
        ipAddress,
      });

      return {
        nodeId: node.nodeId,
        nodeName: node.nodeName || node.nodeId.slice(0, 16),
        isValidator,
        ipAddress,
        port,
        osintPorts,
        osintVulns,
        osintTags,
        osintReputation,
        osintLastScan,
        hasPeeringPort: portCategories.hasPeering,
        hasGrpcDefault: portCategories.hasGrpcDefault,
        hasGrpcOther: portCategories.grpcOther,
        hasOtherPorts: portCategories.otherPorts,
        riskLevel: riskResult.level,
      };
    });
  }, [nodes, peerMap, osintData]);

  // Calculate statistics
  const stats = useMemo<AttackSurfaceStats>(() => {
    const total = attackSurfaceNodes.length;
    const withIp = attackSurfaceNodes.filter((n) => n.ipAddress !== null).length;
    const withoutIp = total - withIp;

    const validators = attackSurfaceNodes.filter((n) => n.isValidator).length;
    const validatorsWithIp = attackSurfaceNodes.filter(
      (n) => n.isValidator && n.ipAddress !== null
    ).length;

    const riskLevels: Record<RiskLevel, number> = {
      critical: attackSurfaceNodes.filter((n) => n.riskLevel === 'critical').length,
      high: attackSurfaceNodes.filter((n) => n.riskLevel === 'high').length,
      medium: attackSurfaceNodes.filter((n) => n.riskLevel === 'medium').length,
      low: attackSurfaceNodes.filter((n) => n.riskLevel === 'low').length,
      unknown: attackSurfaceNodes.filter((n) => n.riskLevel === 'unknown').length,
    };

    const portExposure = {
      peering: attackSurfaceNodes.filter((n) => n.hasPeeringPort).length,
      grpcDefault: attackSurfaceNodes.filter((n) => n.hasGrpcDefault).length,
      grpcOther: attackSurfaceNodes.filter((n) => n.hasGrpcOther.length > 0).length,
    };

    return {
      total,
      withIp,
      withoutIp,
      validators,
      validatorsWithIp,
      riskLevels,
      portExposure,
    };
  }, [attackSurfaceNodes]);

  // Function to get attack surface data for a specific node
  const getNodeAttackSurface = (nodeId: string): AttackSurfaceNode | null => {
    return attackSurfaceNodes.find((n) => n.nodeId === nodeId) ?? null;
  };

  // Format OSINT error for display
  const osintError = osintFetchError
    ? `Failed to load OSINT data: ${osintFetchError instanceof Error ? osintFetchError.message : 'Unknown error'}`
    : null;

  return {
    nodes: attackSurfaceNodes,
    stats,
    isLoading: nodesLoading || peersLoading || osintLoading,
    osintError,
    getNodeAttackSurface,
  };
}
