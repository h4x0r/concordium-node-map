import { useQuery } from '@tanstack/react-query';

export interface PeerData {
  peerId: string;
  source: 'reporting' | 'grpc' | 'inferred';
  firstSeen: number;
  lastSeen: number;
  nodeName: string | null;
  clientVersion: string | null;
  ipAddress: string | null;
  port: number | null;
  geoCountry: string | null;
  geoCity: string | null;
  geoLat: number | null;
  geoLon: number | null;
  geoIsp: string | null;
  seenByCount: number;
  isBootstrapper: boolean;
  catchupStatus: string | null;
  grpcLatencyMs: number | null;
}

export interface PeerStats {
  total: number;
  bySource: {
    reporting: number;
    grpc: number;
    inferred: number;
  };
  withGeo: number;
  bootstrappers: number;
}

export interface PeersResponse {
  peers: PeerData[];
  stats: PeerStats;
}

async function fetchPeers(): Promise<PeersResponse> {
  const res = await fetch('/api/peers');
  if (!res.ok) {
    throw new Error('Failed to fetch peers');
  }
  return res.json();
}

/**
 * Hook to fetch peer data from the API
 */
export function usePeers() {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['peers'],
    queryFn: fetchPeers,
    refetchInterval: 60000, // Refresh every minute
    refetchOnWindowFocus: false,
  });

  return {
    peers: data?.peers ?? [],
    stats: data?.stats,
    isLoading,
    error,
    refresh: refetch,
  };
}

/**
 * Get peer source for a node ID
 */
export function usePeerSource(nodeId: string | null) {
  const { peers } = usePeers();

  if (!nodeId) return null;

  const peer = peers.find((p) => p.peerId === nodeId);
  return peer?.source ?? null;
}

/**
 * Get bootstrapper status for a node ID
 */
export function useIsBootstrapper(nodeId: string | null) {
  const { peers } = usePeers();

  if (!nodeId) return false;

  const peer = peers.find((p) => p.peerId === nodeId);
  return peer?.isBootstrapper ?? false;
}
