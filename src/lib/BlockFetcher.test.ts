/**
 * BlockFetcher tests - TDD approach
 * Tests for fetching block data from Concordium chain via gRPC
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BlockFetcher } from './BlockFetcher';

// Mock the Concordium SDK
vi.mock('@concordium/web-sdk/nodejs', () => ({
  ConcordiumGRPCNodeClient: vi.fn().mockImplementation(() => ({
    getConsensusInfo: vi.fn(),
    getBlockInfo: vi.fn(),
    getBlocksAtHeight: vi.fn(),
  })),
  credentials: {
    createSsl: vi.fn(),
  },
}));

describe('BlockFetcher', () => {
  let fetcher: BlockFetcher;

  beforeEach(() => {
    fetcher = new BlockFetcher('grpc.mainnet.concordium.software', 20000, { timeout: 5000 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getLatestBlockHeight', () => {
    it('returns the current best block height from consensus info', async () => {
      // Mock the protected method
      vi.spyOn(fetcher as any, 'fetchConsensusInfo').mockResolvedValue({
        bestBlockHeight: BigInt(1000000),
        lastFinalizedBlockHeight: BigInt(999990),
      });

      const height = await fetcher.getLatestBlockHeight();
      expect(height).toBe(1000000);
    });

    it('returns null on error', async () => {
      vi.spyOn(fetcher as any, 'fetchConsensusInfo').mockRejectedValue(
        new Error('Connection failed')
      );

      const height = await fetcher.getLatestBlockHeight();
      expect(height).toBeNull();
    });
  });

  describe('getBlockInfoAtHeight', () => {
    it('returns block info with baker ID and timestamp', async () => {
      const mockBlockHash = '0xabc123';
      const blockTime = new Date('2024-01-15T12:00:00Z');

      vi.spyOn(fetcher as any, 'fetchBlockHashAtHeight').mockResolvedValue(mockBlockHash);
      vi.spyOn(fetcher as any, 'fetchBlockInfo').mockResolvedValue({
        blockHash: mockBlockHash,
        blockHeight: BigInt(1000000),
        blockBaker: BigInt(83079),
        blockSlotTime: blockTime,
        transactionCount: 5,
      });

      const blockInfo = await fetcher.getBlockInfoAtHeight(1000000);

      expect(blockInfo).toEqual({
        height: 1000000,
        hash: mockBlockHash,
        bakerId: 83079,
        timestamp: blockTime.getTime(),
        transactionCount: 5,
      });
    });

    it('returns null for height with no blocks', async () => {
      vi.spyOn(fetcher as any, 'fetchBlockHashAtHeight').mockResolvedValue(null);

      const blockInfo = await fetcher.getBlockInfoAtHeight(1000000);
      expect(blockInfo).toBeNull();
    });

    it('handles blocks without baker (genesis or special blocks)', async () => {
      const mockBlockHash = '0xgenesis';
      vi.spyOn(fetcher as any, 'fetchBlockHashAtHeight').mockResolvedValue(mockBlockHash);
      vi.spyOn(fetcher as any, 'fetchBlockInfo').mockResolvedValue({
        blockHash: mockBlockHash,
        blockHeight: BigInt(0),
        blockBaker: undefined, // Genesis block has no baker
        blockSlotTime: new Date('2021-06-09T00:00:00Z'),
        transactionCount: 0,
      });

      const blockInfo = await fetcher.getBlockInfoAtHeight(0);
      expect(blockInfo).toBeNull(); // Skip blocks without baker
    });
  });

  describe('fetchBlockRange', () => {
    it('fetches multiple blocks in a range', async () => {
      // Setup mock for getBlockInfoAtHeight
      vi.spyOn(fetcher, 'getBlockInfoAtHeight').mockImplementation(async (height: number) => ({
        height,
        hash: `0xblock${height}`,
        bakerId: 83079 + height,
        timestamp: Date.now(),
        transactionCount: height % 10,
      }));

      const blocks = await fetcher.fetchBlockRange(100, 102);

      expect(blocks).toHaveLength(3);
      expect(blocks[0].height).toBe(100);
      expect(blocks[1].height).toBe(101);
      expect(blocks[2].height).toBe(102);
    });

    it('skips blocks that fail to fetch (return null)', async () => {
      vi.spyOn(fetcher, 'getBlockInfoAtHeight').mockImplementation(async (height: number) => {
        if (height === 101) return null; // Simulate failed fetch
        return {
          height,
          hash: `0xblock${height}`,
          bakerId: 83079,
          timestamp: Date.now(),
          transactionCount: 0,
        };
      });

      const blocks = await fetcher.fetchBlockRange(100, 102);

      expect(blocks).toHaveLength(2);
      expect(blocks.map(b => b.height)).toEqual([100, 102]);
    });

    it('limits batch size to prevent overwhelming the node', async () => {
      vi.spyOn(fetcher, 'getBlockInfoAtHeight').mockImplementation(async (height: number) => ({
        height,
        hash: `0xblock${height}`,
        bakerId: 83079,
        timestamp: Date.now(),
        transactionCount: 0,
      }));

      // Try to fetch 1000 blocks - should be limited
      const blocks = await fetcher.fetchBlockRange(0, 999);

      // Should be limited to MAX_BLOCKS_PER_FETCH (100)
      expect(blocks.length).toBeLessThanOrEqual(100);
    });
  });

  describe('fetchBlocksSince', () => {
    it('fetches blocks from given height to latest', async () => {
      vi.spyOn(fetcher, 'getLatestBlockHeight').mockResolvedValue(105);
      vi.spyOn(fetcher, 'getBlockInfoAtHeight').mockImplementation(async (height: number) => ({
        height,
        hash: `0xblock${height}`,
        bakerId: 83079,
        timestamp: Date.now(),
        transactionCount: 0,
      }));

      const result = await fetcher.fetchBlocksSince(100);

      expect(result.blocks).toHaveLength(5); // 101, 102, 103, 104, 105
      expect(result.latestHeight).toBe(105);
      expect(result.fromHeight).toBe(101);
    });

    it('returns empty array if no new blocks', async () => {
      vi.spyOn(fetcher, 'getLatestBlockHeight').mockResolvedValue(100);

      const result = await fetcher.fetchBlocksSince(100);

      expect(result.blocks).toHaveLength(0);
      expect(result.latestHeight).toBe(100);
    });

    it('returns error if cannot get latest height', async () => {
      vi.spyOn(fetcher, 'getLatestBlockHeight').mockResolvedValue(null);

      const result = await fetcher.fetchBlocksSince(100);

      expect(result.blocks).toHaveLength(0);
      expect(result.errors).toContain('Failed to get latest block height');
    });
  });
});
