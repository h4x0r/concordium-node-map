import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useNodes, useNetworkMetrics } from './useNodes';
import type { ConcordiumNode } from '@/lib/transforms';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const createMockNode = (overrides: Partial<ConcordiumNode> = {}): ConcordiumNode => ({
  nodeName: 'TestNode',
  nodeId: 'node-123',
  peerType: 'Node',
  client: 'concordium-node/6.3.0',
  peersCount: 5,
  peersList: ['peer-1', 'peer-2'],
  averagePing: 50,
  averageBytesPerSecondIn: 1000,
  averageBytesPerSecondOut: 800,
  bestBlock: 'abc123',
  bestBlockHeight: 1000,
  finalizedBlock: 'def456',
  finalizedBlockHeight: 998,
  consensusRunning: true,
  bakingCommitteeMember: 'ActiveInCommittee',
  finalizationCommitteeMember: true,
  consensusBakerId: 42,
  uptime: 86400000,
  blockArrivePeriodEMA: 10.5,
  blockReceivePeriodEMA: 10.2,
  transactionsPerBlockEMA: 2.5,
  ...overrides,
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useNodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches nodes from API', async () => {
    const mockNodes = [createMockNode({ nodeId: '1' }), createMockNode({ nodeId: '2' })];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockNodes),
    });

    const { result } = renderHook(() => useNodes(), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledWith('/api/nodes');
  });

  it('starts in loading state before data arrives', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    const { result } = renderHook(() => useNodes(), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('provides dataUpdatedAt timestamp', async () => {
    const mockNodes = [createMockNode()];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockNodes),
    });

    const { result } = renderHook(() => useNodes(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.dataUpdatedAt).toBeGreaterThan(0);
  });
});

describe('useNetworkMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates total node count', async () => {
    const mockNodes = [
      createMockNode({ nodeId: '1' }),
      createMockNode({ nodeId: '2' }),
      createMockNode({ nodeId: '3' }),
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockNodes),
    });

    const { result } = renderHook(() => useNetworkMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.metrics).not.toBeNull();
    });

    expect(result.current.metrics?.totalNodes).toBe(3);
  });

  it('calculates average peer count', async () => {
    const mockNodes = [
      createMockNode({ nodeId: '1', peersCount: 10 }),
      createMockNode({ nodeId: '2', peersCount: 20 }),
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockNodes),
    });

    const { result } = renderHook(() => useNetworkMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.metrics).not.toBeNull();
    });

    expect(result.current.metrics?.avgPeers).toBe(15);
  });

  it('calculates finalization lag using 95th percentile', async () => {
    // Create 21 nodes so 5% index = floor(21 * 0.05) = 1, giving us the 2nd highest height
    // Heights sorted descending: [100, 95, 90, 90, 90, ...]
    // percentile95Height = heights[1] = 95
    // lag = 100 - 95 = 5
    const mockNodes = [
      createMockNode({ nodeId: '1', finalizedBlockHeight: 100 }),  // max
      createMockNode({ nodeId: '2', finalizedBlockHeight: 95 }),   // 95th percentile (index 1)
      ...Array.from({ length: 19 }, (_, i) =>
        createMockNode({ nodeId: `${i + 3}`, finalizedBlockHeight: 90 })
      ),
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockNodes),
    });

    const { result } = renderHook(() => useNetworkMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.metrics).not.toBeNull();
    });

    // Max is 100, 95th percentile is 95, lag is 5
    expect(result.current.metrics?.maxFinalizationLag).toBe(5);
  });

  it('calculates consensus participation percentage', async () => {
    const mockNodes = [
      createMockNode({ nodeId: '1', consensusRunning: true }),
      createMockNode({ nodeId: '2', consensusRunning: true }),
      createMockNode({ nodeId: '3', consensusRunning: true }),
      createMockNode({ nodeId: '4', consensusRunning: false }),
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockNodes),
    });

    const { result } = renderHook(() => useNetworkMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.metrics).not.toBeNull();
    });

    // 3 out of 4 have consensus running = 75%
    expect(result.current.metrics?.consensusParticipation).toBe(75);
  });

  it('returns null metrics when loading', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    const { result } = renderHook(() => useNetworkMetrics(), { wrapper: createWrapper() });

    expect(result.current.metrics).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });
});
