import { useMemo } from 'react';
import { useNodes } from './useNodes';
import { usePeers } from './usePeers';
import { useQuery } from '@tanstack/react-query';
import type { OsintFullResponse } from '@/app/api/osint/route';

/**
 * Port categories for attack surface analysis
 */
export const PORT_CATEGORIES = {
  // Critical Concordium ports
  PEERING: 8888,
  GRPC_DEFAULT: 20000,
  // Common gRPC ports
  GRPC_COMMON: [10000, 10001, 11000],
} as const;

export interface AttackSurfaceNode {
  nodeId: string;
  nodeName: string;
  isValidator: boolean;
  ipAddress: string | null;
  port: number | null;

  // OSINT data
  osintPorts: number[];
  osintVulns: string[];
  osintTags: string[];
  osintReputation: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  osintLastScan: string | null;

  // Port categorization
  hasPeeringPort: boolean;      // 8888
  hasGrpcDefault: boolean;       // 20000
  hasGrpcCommon: number[];       // 10000, 10001, 11000
  hasOtherPorts: number[];       // Any other discovered ports

  // Risk assessment
  riskLevel: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
}

/**
 * Assess risk level based on exposed ports and vulnerabilities
 */
function assessRiskLevel(
  osintPorts: number[],
  osintVulns: string[],
  osintReputation: string,
  isValidator: boolean
): 'low' | 'medium' | 'high' | 'critical' | 'unknown' {
  // No IP = unknown risk
  if (osintPorts.length === 0) {
    return 'unknown';
  }

  // Malicious reputation = critical
  if (osintReputation === 'malicious') {
    return 'critical';
  }

  // Many vulns = critical for validators, high for others
  if (osintVulns.length > 5) {
    return isValidator ? 'critical' : 'high';
  }

  // Suspicious reputation or some vulns = high for validators, medium for others
  if (osintReputation === 'suspicious' || osintVulns.length > 0) {
    return isValidator ? 'high' : 'medium';
  }

  // Many exposed ports = medium risk
  if (osintPorts.length > 5) {
    return 'medium';
  }

  // Clean with few ports = low risk
  return 'low';
}

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
 * Hook to aggregate attack surface data from nodes, peers, and OSINT
 */
export function useAttackSurface() {
  const { data: nodes, isLoading: nodesLoading } = useNodes();
  const { peers, isLoading: peersLoading } = usePeers();

  // Build a map of node IDs to peer data
  const peerMap = useMemo(() => {
    const map = new Map<string, typeof peers[0]>();
    peers.forEach(peer => {
      map.set(peer.peerId, peer);
    });
    return map;
  }, [peers]);

  // Get all unique IPs that need OSINT lookup
  const ipsToLookup = useMemo(() => {
    const ips = new Set<string>();
    peers.forEach(peer => {
      if (peer.ipAddress) {
        ips.add(peer.ipAddress);
      }
    });
    return Array.from(ips);
  }, [peers]);

  // Fetch OSINT data for all IPs
  // Note: InternetDB updates on a scanning cycle (days/weeks), not real-time
  // Our database cache is 24 hours, so we only need to refetch when cache expires
  const { data: osintData, isLoading: osintLoading } = useQuery({
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
      const osintReputation = osint?.reputation ?? 'unknown';
      const osintLastScan = osint?.cached_at ?? null;

      // Categorize ports
      const hasPeeringPort = osintPorts.includes(PORT_CATEGORIES.PEERING);
      const hasGrpcDefault = osintPorts.includes(PORT_CATEGORIES.GRPC_DEFAULT);
      const hasGrpcCommon = PORT_CATEGORIES.GRPC_COMMON.filter(p => osintPorts.includes(p));

      // Other ports (excluding known Concordium ports)
      const knownPorts = new Set<number>([
        PORT_CATEGORIES.PEERING,
        PORT_CATEGORIES.GRPC_DEFAULT,
        ...PORT_CATEGORIES.GRPC_COMMON,
      ]);
      const hasOtherPorts = osintPorts.filter((p: number) => !knownPorts.has(p));

      // Assess risk
      const riskLevel = assessRiskLevel(osintPorts, osintVulns, osintReputation, isValidator);

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
        hasPeeringPort,
        hasGrpcDefault,
        hasGrpcCommon,
        hasOtherPorts,
        riskLevel,
      };
    });
  }, [nodes, peerMap, osintData]);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = attackSurfaceNodes.length;
    const withIp = attackSurfaceNodes.filter(n => n.ipAddress !== null).length;
    const withoutIp = total - withIp;

    const validators = attackSurfaceNodes.filter(n => n.isValidator).length;
    const validatorsWithIp = attackSurfaceNodes.filter(n => n.isValidator && n.ipAddress !== null).length;

    const riskLevels = {
      critical: attackSurfaceNodes.filter(n => n.riskLevel === 'critical').length,
      high: attackSurfaceNodes.filter(n => n.riskLevel === 'high').length,
      medium: attackSurfaceNodes.filter(n => n.riskLevel === 'medium').length,
      low: attackSurfaceNodes.filter(n => n.riskLevel === 'low').length,
      unknown: attackSurfaceNodes.filter(n => n.riskLevel === 'unknown').length,
    };

    const portExposure = {
      peering: attackSurfaceNodes.filter(n => n.hasPeeringPort).length,
      grpcDefault: attackSurfaceNodes.filter(n => n.hasGrpcDefault).length,
      grpcCommon: attackSurfaceNodes.filter(n => n.hasGrpcCommon.length > 0).length,
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

  return {
    nodes: attackSurfaceNodes,
    stats,
    isLoading: nodesLoading || peersLoading || osintLoading,
  };
}
