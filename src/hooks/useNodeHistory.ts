'use client';

import { useQuery } from '@tanstack/react-query';
import type { HealthStatus } from '@/components/dashboard/HealthTimeline';
import type { MRTGDataPoint } from '@/components/dashboard/MRTGChart';

interface HistoryDataPoint {
  timestamp: number;
  timestampISO: string;
  healthStatus: 'healthy' | 'lagging' | 'issue';
  peersCount: number | null;
  avgPing: number | null;
  finalizedHeight: number | null;
  heightDelta: number | null;
  bytesIn: number | null;
  bytesOut: number | null;
}

interface NodeHistoryResponse {
  success: boolean;
  nodeId: string;
  timeRange: {
    since: number;
    until: number;
    sinceISO: string;
    untilISO: string;
  };
  downsampleMinutes: number | null;
  dataPoints: number;
  history: HistoryDataPoint[];
}

export interface NodeHistoryData {
  healthHistory: HealthStatus[];
  latencyHistory: MRTGDataPoint[];
  bandwidthInHistory: MRTGDataPoint[];
  bandwidthOutHistory: MRTGDataPoint[];
  peerCountHistory: MRTGDataPoint[];
}

async function fetchNodeHistory(
  nodeId: string,
  minutes: number = 15
): Promise<NodeHistoryResponse> {
  const now = Date.now();
  const since = now - minutes * 60 * 1000;

  const response = await fetch(
    `/api/tracking/node-history?nodeId=${encodeURIComponent(nodeId)}&since=${since}&until=${now}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch node history: ${response.status}`);
  }

  return response.json();
}

function transformHistory(response: NodeHistoryResponse): NodeHistoryData {
  const { history } = response;

  // Transform to chart data formats
  const healthHistory: HealthStatus[] = history.map(h => ({
    timestamp: h.timestamp,
    status: h.healthStatus,
  }));

  const latencyHistory: MRTGDataPoint[] = history
    .filter(h => h.avgPing !== null)
    .map(h => ({
      timestamp: h.timestamp,
      value: h.avgPing!,
    }));

  const bandwidthInHistory: MRTGDataPoint[] = history
    .filter(h => h.bytesIn !== null)
    .map(h => ({
      timestamp: h.timestamp,
      value: h.bytesIn! / 1024, // Convert to KB/s
    }));

  const bandwidthOutHistory: MRTGDataPoint[] = history
    .filter(h => h.bytesOut !== null)
    .map(h => ({
      timestamp: h.timestamp,
      value: h.bytesOut! / 1024, // Convert to KB/s
    }));

  const peerCountHistory: MRTGDataPoint[] = history
    .filter(h => h.peersCount !== null)
    .map(h => ({
      timestamp: h.timestamp,
      value: h.peersCount!,
    }));

  return {
    healthHistory,
    latencyHistory,
    bandwidthInHistory,
    bandwidthOutHistory,
    peerCountHistory,
  };
}

/**
 * Hook to fetch historical data for a specific node
 * @param nodeId - The node ID to fetch history for (null to disable)
 * @param minutes - Number of minutes of history to fetch (default: 15)
 */
export function useNodeHistory(nodeId: string | null, minutes: number = 15) {
  const query = useQuery({
    queryKey: ['nodeHistory', nodeId, minutes],
    queryFn: () => fetchNodeHistory(nodeId!, minutes),
    enabled: !!nodeId,
    refetchInterval: 60000, // Refetch every minute
    staleTime: 30000, // Consider data stale after 30 seconds
  });

  const data = query.data ? transformHistory(query.data) : null;

  return {
    data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    dataPoints: query.data?.dataPoints ?? 0,
  };
}
