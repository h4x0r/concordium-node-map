/**
 * Tests for poll-blocks cron endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock implementations with vi.fn() for each method
const mockGetLatestBlockHeight = vi.fn();
const mockProcessBlocks = vi.fn();
const mockRecalculateBlockCounts = vi.fn();
const mockFetchBlocksSince = vi.fn();
const mockFetcherGetLatestBlockHeight = vi.fn();

// Mock modules before importing the route
vi.mock('@/lib/db/client', () => ({
  getDbClient: vi.fn(() => ({})),
  initializeSchema: vi.fn(),
}));

vi.mock('@/lib/BlockFetcher', () => ({
  createMainnetBlockFetcher: vi.fn(() => ({
    fetchBlocksSince: mockFetchBlocksSince,
    getLatestBlockHeight: mockFetcherGetLatestBlockHeight,
  })),
}));

vi.mock('@/lib/db/BlockTracker', () => {
  return {
    BlockTracker: class MockBlockTracker {
      getLatestBlockHeight = mockGetLatestBlockHeight;
      processBlocks = mockProcessBlocks;
      recalculateBlockCounts = mockRecalculateBlockCounts;
    },
  };
});

// Import after mocks
import { GET } from './route';

describe('/api/cron/poll-blocks', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns endpoint info when no auth provided', async () => {
    const request = new Request('http://localhost/api/cron/poll-blocks');
    const response = await GET(request);
    const json = await response.json();

    expect(json.endpoint).toBe('/api/cron/poll-blocks');
    expect(json.description).toContain('block');
  });

  it('returns 401 for invalid auth', async () => {
    const request = new Request('http://localhost/api/cron/poll-blocks', {
      headers: { Authorization: 'Bearer wrong-secret' },
    });

    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('processes blocks when authenticated', async () => {
    // Setup mocks
    mockGetLatestBlockHeight.mockResolvedValue(1000);
    mockProcessBlocks.mockResolvedValue({
      blocksProcessed: 10,
      uniqueBakers: 5,
      unknownBakers: [],
      skippedDuplicates: 0,
    });
    mockRecalculateBlockCounts.mockResolvedValue(undefined);

    mockFetchBlocksSince.mockResolvedValue({
      blocks: Array.from({ length: 10 }, (_, i) => ({
        height: 1001 + i,
        hash: `0xhash${i}`,
        bakerId: 1000 + (i % 3),
        timestamp: Date.now(),
        transactionCount: i,
      })),
      latestHeight: 1010,
      fromHeight: 1001,
      errors: [],
    });

    const request = new Request('http://localhost/api/cron/poll-blocks', {
      headers: { Authorization: 'Bearer test-secret' },
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.blockTracking).toBeDefined();
    expect(json.blockTracking.blocksProcessed).toBe(10);
    expect(mockProcessBlocks).toHaveBeenCalled();
    expect(mockRecalculateBlockCounts).toHaveBeenCalled();
  });

  it('handles no new blocks gracefully', async () => {
    mockGetLatestBlockHeight.mockResolvedValue(1000);
    mockProcessBlocks.mockResolvedValue({
      blocksProcessed: 0,
      uniqueBakers: 0,
      unknownBakers: [],
      skippedDuplicates: 0,
    });
    mockRecalculateBlockCounts.mockResolvedValue(undefined);

    mockFetchBlocksSince.mockResolvedValue({
      blocks: [],
      latestHeight: 1000,
      fromHeight: 1000,
      errors: [],
    });

    const request = new Request('http://localhost/api/cron/poll-blocks', {
      headers: { Authorization: 'Bearer test-secret' },
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.blockTracking.blocksProcessed).toBe(0);
  });

  it('starts from recent blocks when no blocks recorded', async () => {
    mockGetLatestBlockHeight.mockResolvedValue(null); // No blocks yet
    mockProcessBlocks.mockResolvedValue({
      blocksProcessed: 50,
      uniqueBakers: 20,
      unknownBakers: [],
      skippedDuplicates: 0,
    });
    mockRecalculateBlockCounts.mockResolvedValue(undefined);

    mockFetcherGetLatestBlockHeight.mockResolvedValue(15000000); // Current chain height
    mockFetchBlocksSince.mockResolvedValue({
      blocks: Array.from({ length: 50 }, (_, i) => ({
        height: 14999950 + i,
        hash: `0xhash${i}`,
        bakerId: 1000,
        timestamp: Date.now(),
        transactionCount: 0,
      })),
      latestHeight: 15000000,
      fromHeight: 14999950,
      errors: [],
    });

    const request = new Request('http://localhost/api/cron/poll-blocks', {
      headers: { Authorization: 'Bearer test-secret' },
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    // When no blocks recorded, should start from recent blocks (not genesis)
    expect(mockFetcherGetLatestBlockHeight).toHaveBeenCalled();
  });

  it('returns 502 when chain height unavailable on first run', async () => {
    mockGetLatestBlockHeight.mockResolvedValue(null); // No blocks yet
    mockFetcherGetLatestBlockHeight.mockResolvedValue(null); // Chain unavailable

    const request = new Request('http://localhost/api/cron/poll-blocks', {
      headers: { Authorization: 'Bearer test-secret' },
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.error).toContain('chain height');
  });
});
