/**
 * TDD Tests for BlockTracker (RED Phase)
 *
 * Tests for tracking block production by validators:
 * - Fetching recent finalized blocks from chain
 * - Recording which baker produced each block
 * - Updating validator block counts (blocks_24h, blocks_7d)
 * - Calculating phantom block percentage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Client } from '@libsql/client';
import { BlockTracker, type BlockInfo, type BlockProductionStats } from './BlockTracker';
import { ValidatorTracker, type ChainValidator } from './ValidatorTracker';
import { createTestDb } from './test-helpers';

describe('BlockTracker', () => {
  let db: Client;
  let blockTracker: BlockTracker;
  let validatorTracker: ValidatorTracker;

  // Helper to create mock chain validators
  function createMockChainValidator(overrides: Partial<ChainValidator> = {}): ChainValidator {
    return {
      bakerId: 42,
      accountAddress: '3ABC123...',
      equityCapital: BigInt('500000000000'),
      delegatedCapital: BigInt('100000000000'),
      totalStake: BigInt('600000000000'),
      lotteryPower: 0.008,
      openStatus: 'openForAll',
      commissionRates: { baking: 0.1, finalization: 0.1, transaction: 0.1 },
      inCurrentPayday: true,
      effectiveStake: BigInt('600000000000'),
      ...overrides,
    };
  }

  // Helper to create mock block info
  function createMockBlockInfo(
    height: number,
    bakerId: number,
    timestamp: number = Date.now()
  ): BlockInfo {
    return {
      height,
      bakerId,
      timestamp,
      hash: `block-${height}-${bakerId}`,
    };
  }

  beforeEach(async () => {
    db = await createTestDb();
    blockTracker = new BlockTracker(db);
    validatorTracker = new ValidatorTracker(db);
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  describe('processBlocks', () => {
    it('records blocks produced by validators', async () => {
      // Setup: Create validators first
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1 }),
        createMockChainValidator({ bakerId: 2 }),
      ], []);

      const blocks: BlockInfo[] = [
        createMockBlockInfo(1000, 1),
        createMockBlockInfo(1001, 2),
        createMockBlockInfo(1002, 1),
      ];

      const result = await blockTracker.processBlocks(blocks);

      expect(result.blocksProcessed).toBe(3);
      expect(result.uniqueBakers).toBe(2);
    });

    it('updates validator block counts', async () => {
      // Setup: Create validators
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1 }),
        createMockChainValidator({ bakerId: 2 }),
      ], []);

      const now = Date.now();
      const blocks: BlockInfo[] = [
        createMockBlockInfo(1000, 1, now - 1000), // Baker 1
        createMockBlockInfo(1001, 1, now - 2000), // Baker 1
        createMockBlockInfo(1002, 2, now - 3000), // Baker 2
      ];

      await blockTracker.processBlocks(blocks);

      // Verify validator block counts updated
      const v1 = await db.execute('SELECT blocks_24h, last_block_height FROM validators WHERE baker_id = 1');
      expect(v1.rows[0].blocks_24h).toBe(2);
      expect(v1.rows[0].last_block_height).toBe(1001);

      const v2 = await db.execute('SELECT blocks_24h FROM validators WHERE baker_id = 2');
      expect(v2.rows[0].blocks_24h).toBe(1);
    });

    it('handles blocks from unknown validators', async () => {
      // Setup: Only create validator 1
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1 }),
      ], []);

      const blocks: BlockInfo[] = [
        createMockBlockInfo(1000, 1),
        createMockBlockInfo(1001, 999), // Unknown baker
      ];

      const result = await blockTracker.processBlocks(blocks);

      // Should process what it can and track unknowns
      expect(result.blocksProcessed).toBe(2);
      expect(result.unknownBakers).toContain(999);
    });

    it('avoids reprocessing already-seen blocks', async () => {
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1 }),
      ], []);

      const blocks: BlockInfo[] = [
        createMockBlockInfo(1000, 1),
      ];

      // Process same block twice
      await blockTracker.processBlocks(blocks);
      const result = await blockTracker.processBlocks(blocks);

      // Second call should skip already-processed block
      expect(result.blocksProcessed).toBe(0);
      expect(result.skippedDuplicates).toBe(1);
    });
  });

  describe('calculateBlockProductionStats', () => {
    it('calculates blocks by visible vs phantom validators', async () => {
      // Setup: Create one visible and one phantom validator
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1 }),  // phantom
        createMockChainValidator({ bakerId: 2 }),  // visible
      ], [{ peerId: 'peer-2', consensusBakerId: 2, nodeName: 'Visible Baker' }]);

      const now = Date.now();
      const blocks: BlockInfo[] = [
        createMockBlockInfo(1000, 1, now - 1000), // phantom
        createMockBlockInfo(1001, 2, now - 2000), // visible
        createMockBlockInfo(1002, 1, now - 3000), // phantom
        createMockBlockInfo(1003, 2, now - 4000), // visible
      ];

      await blockTracker.processBlocks(blocks);

      const stats = await blockTracker.calculateBlockProductionStats(24 * 60 * 60 * 1000); // 24h

      expect(stats.totalBlocks).toBe(4);
      expect(stats.blocksByVisible).toBe(2);
      expect(stats.blocksByPhantom).toBe(2);
      expect(stats.phantomBlockPct).toBeCloseTo(50.0, 1);
    });

    it('returns zero stats when no blocks recorded', async () => {
      const stats = await blockTracker.calculateBlockProductionStats(24 * 60 * 60 * 1000);

      expect(stats.totalBlocks).toBe(0);
      expect(stats.blocksByVisible).toBe(0);
      expect(stats.blocksByPhantom).toBe(0);
      expect(stats.phantomBlockPct).toBe(0);
    });

    it('respects time window for stats calculation', async () => {
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1 }),
      ], []);

      const now = Date.now();
      // Use 59 minutes ago (not exactly 60 min) to avoid timing race conditions
      const lessThanOneHourAgo = now - 59 * 60 * 1000;
      // Use 2.5 hours ago (clearly outside 1h window)
      const twoAndHalfHoursAgo = now - 2.5 * 60 * 60 * 1000;

      const blocks: BlockInfo[] = [
        createMockBlockInfo(1000, 1, lessThanOneHourAgo), // Within 1h window
        createMockBlockInfo(1001, 1, twoAndHalfHoursAgo), // Outside 1h, within 3h
      ];

      await blockTracker.processBlocks(blocks);

      // 1-hour window should only count recent block
      const stats1h = await blockTracker.calculateBlockProductionStats(60 * 60 * 1000);
      expect(stats1h.totalBlocks).toBe(1);

      // 3-hour window should count both
      const stats3h = await blockTracker.calculateBlockProductionStats(3 * 60 * 60 * 1000);
      expect(stats3h.totalBlocks).toBe(2);
    });
  });

  describe('getTopBlockProducers', () => {
    it('returns validators sorted by block production', async () => {
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1 }),
        createMockChainValidator({ bakerId: 2 }),
        createMockChainValidator({ bakerId: 3 }),
      ], []);

      const now = Date.now();
      const blocks: BlockInfo[] = [
        // Baker 2 produces most blocks
        createMockBlockInfo(1000, 2, now - 1000),
        createMockBlockInfo(1001, 2, now - 2000),
        createMockBlockInfo(1002, 2, now - 3000),
        // Baker 1 produces fewer
        createMockBlockInfo(1003, 1, now - 4000),
        createMockBlockInfo(1004, 1, now - 5000),
        // Baker 3 produces least
        createMockBlockInfo(1005, 3, now - 6000),
      ];

      await blockTracker.processBlocks(blocks);

      const top = await blockTracker.getTopBlockProducers(2); // top 2

      expect(top).toHaveLength(2);
      expect(top[0].bakerId).toBe(2);
      expect(top[0].blockCount).toBe(3);
      expect(top[1].bakerId).toBe(1);
      expect(top[1].blockCount).toBe(2);
    });
  });

  describe('getBlocksByBaker', () => {
    it('returns blocks produced by specific baker', async () => {
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1 }),
        createMockChainValidator({ bakerId: 2 }),
      ], []);

      const now = Date.now();
      const blocks: BlockInfo[] = [
        createMockBlockInfo(1000, 1, now - 1000),
        createMockBlockInfo(1001, 2, now - 2000),
        createMockBlockInfo(1002, 1, now - 3000),
      ];

      await blockTracker.processBlocks(blocks);

      const baker1Blocks = await blockTracker.getBlocksByBaker(1);

      expect(baker1Blocks).toHaveLength(2);
      expect(baker1Blocks.every(b => b.bakerId === 1)).toBe(true);
    });
  });

  describe('recalculateBlockCounts', () => {
    it('recalculates blocks_24h and blocks_7d for all validators', async () => {
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1 }),
        createMockChainValidator({ bakerId: 2 }),
      ], []);

      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

      const blocks: BlockInfo[] = [
        // Recent blocks (within 24h)
        createMockBlockInfo(1000, 1, now - 1000),
        createMockBlockInfo(1001, 1, now - 2000),
        // Older blocks (within 7d but not 24h)
        createMockBlockInfo(1002, 1, threeDaysAgo),
        createMockBlockInfo(1003, 2, threeDaysAgo),
      ];

      await blockTracker.processBlocks(blocks);
      await blockTracker.recalculateBlockCounts();

      const v1 = await db.execute('SELECT blocks_24h, blocks_7d FROM validators WHERE baker_id = 1');
      expect(v1.rows[0].blocks_24h).toBe(2);
      expect(v1.rows[0].blocks_7d).toBe(3);

      const v2 = await db.execute('SELECT blocks_24h, blocks_7d FROM validators WHERE baker_id = 2');
      expect(v2.rows[0].blocks_24h).toBe(0);
      expect(v2.rows[0].blocks_7d).toBe(1);
    });
  });

  describe('getLatestBlockHeight', () => {
    it('returns the highest processed block height', async () => {
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1 }),
      ], []);

      const blocks: BlockInfo[] = [
        createMockBlockInfo(1000, 1),
        createMockBlockInfo(1005, 1),
        createMockBlockInfo(1002, 1),
      ];

      await blockTracker.processBlocks(blocks);

      const latest = await blockTracker.getLatestBlockHeight();

      expect(latest).toBe(1005);
    });

    it('returns null when no blocks processed', async () => {
      const latest = await blockTracker.getLatestBlockHeight();

      expect(latest).toBeNull();
    });
  });
});
