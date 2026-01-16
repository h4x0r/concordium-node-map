/**
 * TDD Tests for ValidatorFetcher (RED Phase)
 *
 * Tests for fetching all validators from Concordium chain via gRPC:
 * - getBakerList() to get all registered bakers
 * - getPoolInfo() for each baker to get detailed info
 * - Transforms data to ChainValidator[] format for ValidatorTracker
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ValidatorFetcher, type FetchResult } from './ValidatorFetcher';
import type { ChainValidator } from './db/ValidatorTracker';

// Mock the Concordium SDK
vi.mock('@concordium/web-sdk/nodejs', () => ({
  ConcordiumGRPCNodeClient: vi.fn().mockImplementation(() => ({
    getBakerList: vi.fn(),
    getPoolInfo: vi.fn(),
  })),
  credentials: {
    createSsl: vi.fn(),
  },
}));

describe('ValidatorFetcher', () => {
  let fetcher: ValidatorFetcher;

  beforeEach(() => {
    fetcher = new ValidatorFetcher('grpc.mainnet.concordium.software', 20000);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchAllValidators', () => {
    it('fetches all bakers from getBakerList', async () => {
      // Mock baker IDs returned from getBakerList
      const mockBakerIds = [
        { value: BigInt(1) },
        { value: BigInt(42) },
        { value: BigInt(100) },
      ];

      // Mock pool info for each baker
      const mockPoolInfos = new Map([
        [1, createMockPoolInfo(1, '3ABC...', BigInt('500000000000'))],
        [42, createMockPoolInfo(42, '3DEF...', BigInt('1000000000000'))],
        [100, createMockPoolInfo(100, '3GHI...', BigInt('200000000000'))],
      ]);

      vi.spyOn(fetcher as any, 'fetchBakerList').mockResolvedValue(mockBakerIds);
      vi.spyOn(fetcher as any, 'fetchPoolInfo').mockImplementation(
        async (bakerId: number) => mockPoolInfos.get(bakerId)
      );

      const result = await fetcher.fetchAllValidators();

      expect(result.validators).toHaveLength(3);
      expect(result.totalFetched).toBe(3);
      expect(result.errors).toHaveLength(0);
    });

    it('transforms pool info to ChainValidator format', async () => {
      const mockBakerIds = [{ value: BigInt(42) }];
      // With single validator, lottery power = 100% of network
      const mockPoolInfo = createMockPoolInfo(42, '3TestAccount123', BigInt('600000000000'), {
        equityCapital: BigInt('500000000000'),
        delegatedCapital: BigInt('100000000000'),
        openStatus: 'openForAll',
        commissionRates: { baking: 0.1, finalization: 0.1, transaction: 0.1 },
        inCurrentPayday: true,
        effectiveStake: BigInt('600000000000'),
      });

      vi.spyOn(fetcher as any, 'fetchBakerList').mockResolvedValue(mockBakerIds);
      vi.spyOn(fetcher as any, 'fetchPoolInfo').mockResolvedValue(mockPoolInfo);

      const result = await fetcher.fetchAllValidators();

      expect(result.validators).toHaveLength(1);
      const validator = result.validators[0];

      expect(validator.bakerId).toBe(42);
      expect(validator.accountAddress).toBe('3TestAccount123');
      expect(validator.equityCapital).toBe(BigInt('500000000000'));
      expect(validator.delegatedCapital).toBe(BigInt('100000000000'));
      expect(validator.totalStake).toBe(BigInt('600000000000'));
      // Single validator has 100% lottery power (stake/totalNetworkStake)
      expect(validator.lotteryPower).toBeCloseTo(1.0);
      expect(validator.openStatus).toBe('openForAll');
      expect(validator.commissionRates.baking).toBeCloseTo(0.1);
      expect(validator.inCurrentPayday).toBe(true);
    });

    it('handles partial failures gracefully', async () => {
      const mockBakerIds = [
        { value: BigInt(1) },
        { value: BigInt(2) }, // This one will fail
        { value: BigInt(3) },
      ];

      vi.spyOn(fetcher as any, 'fetchBakerList').mockResolvedValue(mockBakerIds);
      vi.spyOn(fetcher as any, 'fetchPoolInfo').mockImplementation(async (bakerId: number) => {
        if (bakerId === 2) {
          throw new Error('Pool info unavailable');
        }
        return createMockPoolInfo(bakerId, `3Account${bakerId}`, BigInt('100000000000'));
      });

      const result = await fetcher.fetchAllValidators();

      // Should still get the two successful ones
      expect(result.validators).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('2'); // Baker ID 2 failed
    });

    it('returns empty result when getBakerList fails', async () => {
      vi.spyOn(fetcher as any, 'fetchBakerList').mockRejectedValue(
        new Error('Connection refused')
      );

      const result = await fetcher.fetchAllValidators();

      expect(result.validators).toHaveLength(0);
      expect(result.totalFetched).toBe(0);
      expect(result.errors).toContain('Failed to fetch baker list: Connection refused');
    });

    it('calculates total network stake', async () => {
      const mockBakerIds = [
        { value: BigInt(1) },
        { value: BigInt(2) },
      ];

      vi.spyOn(fetcher as any, 'fetchBakerList').mockResolvedValue(mockBakerIds);
      vi.spyOn(fetcher as any, 'fetchPoolInfo').mockImplementation(async (bakerId: number) => {
        const stake = bakerId === 1 ? BigInt('600000000000') : BigInt('400000000000');
        return createMockPoolInfo(bakerId, `3Account${bakerId}`, stake);
      });

      const result = await fetcher.fetchAllValidators();

      expect(result.totalNetworkStake).toBe(BigInt('1000000000000'));
    });
  });

  describe('fetchPoolInfo', () => {
    it('handles removed/suspended pools', async () => {
      const mockBakerIds = [{ value: BigInt(99) }];

      // Pool exists but is suspended
      const suspendedPoolInfo = createMockPoolInfo(99, '3Suspended', BigInt('0'), {
        isSuspended: true,
      });

      vi.spyOn(fetcher as any, 'fetchBakerList').mockResolvedValue(mockBakerIds);
      vi.spyOn(fetcher as any, 'fetchPoolInfo').mockResolvedValue(suspendedPoolInfo);

      const result = await fetcher.fetchAllValidators();

      expect(result.validators).toHaveLength(1);
      // Suspended validators should still be tracked but marked appropriately
      expect(result.validators[0].bakerId).toBe(99);
    });

    it('extracts commission rates from nested pool info', async () => {
      const mockBakerIds = [{ value: BigInt(5) }];
      const mockPoolInfo = createMockPoolInfo(5, '3Commission', BigInt('100000000000'), {
        commissionRates: {
          baking: 0.15,
          finalization: 0.12,
          transaction: 0.05,
        },
      });

      vi.spyOn(fetcher as any, 'fetchBakerList').mockResolvedValue(mockBakerIds);
      vi.spyOn(fetcher as any, 'fetchPoolInfo').mockResolvedValue(mockPoolInfo);

      const result = await fetcher.fetchAllValidators();

      const validator = result.validators[0];
      expect(validator.commissionRates.baking).toBeCloseTo(0.15);
      expect(validator.commissionRates.finalization).toBeCloseTo(0.12);
      expect(validator.commissionRates.transaction).toBeCloseTo(0.05);
    });
  });

  describe('batching and rate limiting', () => {
    it('fetches pool info in batches to avoid overwhelming endpoint', async () => {
      // Create 50 mock bakers
      const mockBakerIds = Array.from({ length: 50 }, (_, i) => ({
        value: BigInt(i + 1),
      }));

      const fetchPoolInfoSpy = vi.fn().mockImplementation(async (bakerId: number) =>
        createMockPoolInfo(bakerId, `3Account${bakerId}`, BigInt('100000000000'))
      );

      vi.spyOn(fetcher as any, 'fetchBakerList').mockResolvedValue(mockBakerIds);
      vi.spyOn(fetcher as any, 'fetchPoolInfo').mockImplementation(fetchPoolInfoSpy);

      const result = await fetcher.fetchAllValidators();

      expect(result.validators).toHaveLength(50);
      expect(fetchPoolInfoSpy).toHaveBeenCalledTimes(50);
    });

    it('respects concurrency limit', async () => {
      const mockBakerIds = Array.from({ length: 20 }, (_, i) => ({
        value: BigInt(i + 1),
      }));

      let concurrentCalls = 0;
      let maxConcurrent = 0;

      const fetchPoolInfoSpy = vi.fn().mockImplementation(async (bakerId: number) => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);

        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 10));

        concurrentCalls--;
        return createMockPoolInfo(bakerId, `3Account${bakerId}`, BigInt('100000000000'));
      });

      vi.spyOn(fetcher as any, 'fetchBakerList').mockResolvedValue(mockBakerIds);
      vi.spyOn(fetcher as any, 'fetchPoolInfo').mockImplementation(fetchPoolInfoSpy);

      // Use a fetcher with explicit concurrency limit
      const limitedFetcher = new ValidatorFetcher(
        'grpc.mainnet.concordium.software',
        20000,
        { concurrencyLimit: 5 }
      );
      vi.spyOn(limitedFetcher as any, 'fetchBakerList').mockResolvedValue(mockBakerIds);
      vi.spyOn(limitedFetcher as any, 'fetchPoolInfo').mockImplementation(fetchPoolInfoSpy);

      await limitedFetcher.fetchAllValidators();

      // Should never exceed concurrency limit
      expect(maxConcurrent).toBeLessThanOrEqual(5);
    });
  });

  describe('caching', () => {
    it('caches results for configured duration', async () => {
      const mockBakerIds = [{ value: BigInt(1) }];
      const fetchBakerListSpy = vi.fn().mockResolvedValue(mockBakerIds);
      const fetchPoolInfoSpy = vi.fn().mockResolvedValue(
        createMockPoolInfo(1, '3Account1', BigInt('100000000000'))
      );

      vi.spyOn(fetcher as any, 'fetchBakerList').mockImplementation(fetchBakerListSpy);
      vi.spyOn(fetcher as any, 'fetchPoolInfo').mockImplementation(fetchPoolInfoSpy);

      // First call
      await fetcher.fetchAllValidators();
      // Second call (should use cache)
      await fetcher.fetchAllValidators();

      // fetchBakerList should only be called once due to caching
      expect(fetchBakerListSpy).toHaveBeenCalledTimes(1);
    });

    it('invalidates cache after TTL expires', async () => {
      const cachingFetcher = new ValidatorFetcher(
        'grpc.mainnet.concordium.software',
        20000,
        { cacheTtlMs: 100 } // 100ms cache
      );

      const mockBakerIds = [{ value: BigInt(1) }];
      const fetchBakerListSpy = vi.fn().mockResolvedValue(mockBakerIds);

      vi.spyOn(cachingFetcher as any, 'fetchBakerList').mockImplementation(fetchBakerListSpy);
      vi.spyOn(cachingFetcher as any, 'fetchPoolInfo').mockResolvedValue(
        createMockPoolInfo(1, '3Account1', BigInt('100000000000'))
      );

      // First call
      await cachingFetcher.fetchAllValidators();

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Second call (cache expired, should fetch again)
      await cachingFetcher.fetchAllValidators();

      expect(fetchBakerListSpy).toHaveBeenCalledTimes(2);
    });

    it('allows force refresh to bypass cache', async () => {
      const mockBakerIds = [{ value: BigInt(1) }];
      const fetchBakerListSpy = vi.fn().mockResolvedValue(mockBakerIds);

      vi.spyOn(fetcher as any, 'fetchBakerList').mockImplementation(fetchBakerListSpy);
      vi.spyOn(fetcher as any, 'fetchPoolInfo').mockResolvedValue(
        createMockPoolInfo(1, '3Account1', BigInt('100000000000'))
      );

      // First call
      await fetcher.fetchAllValidators();
      // Second call with force refresh
      await fetcher.fetchAllValidators({ forceRefresh: true });

      expect(fetchBakerListSpy).toHaveBeenCalledTimes(2);
    });
  });
});

/**
 * Helper to create mock pool info matching gRPC response structure
 */
function createMockPoolInfo(
  bakerId: number,
  accountAddress: string,
  totalStake: bigint,
  overrides: Partial<{
    equityCapital: bigint;
    delegatedCapital: bigint;
    lotteryPower: number;
    openStatus: string;
    commissionRates: { baking: number; finalization: number; transaction: number };
    inCurrentPayday: boolean;
    effectiveStake: bigint;
    isSuspended: boolean;
  }> = {}
) {
  const equityCapital = overrides.equityCapital ?? totalStake;
  const delegatedCapital = overrides.delegatedCapital ?? BigInt(0);

  return {
    baker: { value: BigInt(bakerId) },
    address: { value: accountAddress },
    equityCapital: { value: equityCapital },
    delegatedCapital: { value: delegatedCapital },
    poolInfo: {
      openStatus: { tag: overrides.openStatus ?? 'openForAll' },
      commissionRates: {
        baking: { partsPerHundredThousand: Math.round((overrides.commissionRates?.baking ?? 0.1) * 100000) },
        finalization: { partsPerHundredThousand: Math.round((overrides.commissionRates?.finalization ?? 0.1) * 100000) },
        transaction: { partsPerHundredThousand: Math.round((overrides.commissionRates?.transaction ?? 0.1) * 100000) },
      },
    },
    currentPaydayInfo: overrides.inCurrentPayday !== false ? {
      effectiveStake: { value: overrides.effectiveStake ?? totalStake },
      // Lottery power is calculated from stake ratios
    } : undefined,
    allPoolTotalCapital: { value: BigInt('10000000000000') }, // 10M CCD total
    isSuspended: overrides.isSuspended ?? false,
    // Lottery power: individual stake / total network stake
    _computedLotteryPower: overrides.lotteryPower ?? Number(totalStake) / Number(BigInt('10000000000000')),
  };
}
