/**
 * TDD Tests for ValidatorFetcher (Updated for getBakersRewardPeriod)
 *
 * Tests for fetching all validators from Concordium chain via gRPC:
 * - getBakersRewardPeriod() to get all bakers in a single efficient stream
 * - Transforms data to ChainValidator[] format for ValidatorTracker
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ValidatorFetcher } from './ValidatorFetcher';

// Mock the Concordium SDK
vi.mock('@concordium/web-sdk/nodejs', () => ({
  ConcordiumGRPCNodeClient: vi.fn().mockImplementation(() => ({
    getBakersRewardPeriod: vi.fn(),
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
    it('fetches all bakers from getBakersRewardPeriod', async () => {
      // Mock baker reward period info stream
      const mockBakers = [
        createMockBakerRewardPeriodInfo(1, BigInt('500000000000')),
        createMockBakerRewardPeriodInfo(42, BigInt('1000000000000')),
        createMockBakerRewardPeriodInfo(100, BigInt('200000000000')),
      ];

      vi.spyOn(fetcher as any, 'fetchBakersRewardPeriod').mockResolvedValue(mockBakers);

      const result = await fetcher.fetchAllValidators();

      expect(result.validators).toHaveLength(3);
      expect(result.totalFetched).toBe(3);
      expect(result.errors).toHaveLength(0);
    });

    it('transforms BakerRewardPeriodInfo to ChainValidator format', async () => {
      const mockBakers = [
        createMockBakerRewardPeriodInfo(42, BigInt('600000000000'), {
          equityCapital: BigInt('500000000000'),
          delegatedCapital: BigInt('100000000000'),
          commissionRates: { baking: 0.1, finalization: 0.1, transaction: 0.1 },
        }),
      ];

      vi.spyOn(fetcher as any, 'fetchBakersRewardPeriod').mockResolvedValue(mockBakers);

      const result = await fetcher.fetchAllValidators();

      expect(result.validators).toHaveLength(1);
      const validator = result.validators[0];

      expect(validator.bakerId).toBe(42);
      expect(validator.equityCapital).toBe(BigInt('500000000000'));
      expect(validator.delegatedCapital).toBe(BigInt('100000000000'));
      expect(validator.totalStake).toBe(BigInt('600000000000'));
      // Single validator has 100% lottery power (stake/totalNetworkStake)
      expect(validator.lotteryPower).toBeCloseTo(1.0);
      expect(validator.commissionRates.baking).toBeCloseTo(0.1);
      expect(validator.inCurrentPayday).toBe(true);
    });

    it('returns empty result when getBakersRewardPeriod fails', async () => {
      vi.spyOn(fetcher as any, 'fetchBakersRewardPeriod').mockRejectedValue(
        new Error('Connection refused')
      );

      const result = await fetcher.fetchAllValidators();

      expect(result.validators).toHaveLength(0);
      expect(result.totalFetched).toBe(0);
      expect(result.errors).toContain('Failed to fetch bakers: Connection refused');
    });

    it('calculates total network stake', async () => {
      const mockBakers = [
        createMockBakerRewardPeriodInfo(1, BigInt('600000000000')),
        createMockBakerRewardPeriodInfo(2, BigInt('400000000000')),
      ];

      vi.spyOn(fetcher as any, 'fetchBakersRewardPeriod').mockResolvedValue(mockBakers);

      const result = await fetcher.fetchAllValidators();

      expect(result.totalNetworkStake).toBe(BigInt('1000000000000'));
    });

    it('calculates lottery power based on stake proportion', async () => {
      const mockBakers = [
        createMockBakerRewardPeriodInfo(1, BigInt('600000000000')),
        createMockBakerRewardPeriodInfo(2, BigInt('400000000000')),
      ];

      vi.spyOn(fetcher as any, 'fetchBakersRewardPeriod').mockResolvedValue(mockBakers);

      const result = await fetcher.fetchAllValidators();

      // Baker 1 has 60% of stake
      expect(result.validators[0].lotteryPower).toBeCloseTo(0.6);
      // Baker 2 has 40% of stake
      expect(result.validators[1].lotteryPower).toBeCloseTo(0.4);
    });
  });

  describe('commission rates', () => {
    it('extracts commission rates from baker info', async () => {
      const mockBakers = [
        createMockBakerRewardPeriodInfo(5, BigInt('100000000000'), {
          commissionRates: {
            baking: 0.15,
            finalization: 0.12,
            transaction: 0.05,
          },
        }),
      ];

      vi.spyOn(fetcher as any, 'fetchBakersRewardPeriod').mockResolvedValue(mockBakers);

      const result = await fetcher.fetchAllValidators();

      const validator = result.validators[0];
      expect(validator.commissionRates.baking).toBeCloseTo(0.15);
      expect(validator.commissionRates.finalization).toBeCloseTo(0.12);
      expect(validator.commissionRates.transaction).toBeCloseTo(0.05);
    });
  });

  describe('large validator sets', () => {
    it('handles many validators efficiently', async () => {
      // Create 150 mock bakers
      const mockBakers = Array.from({ length: 150 }, (_, i) =>
        createMockBakerRewardPeriodInfo(i + 1, BigInt('100000000000'))
      );

      const fetchBakersSpy = vi.fn().mockResolvedValue(mockBakers);
      vi.spyOn(fetcher as any, 'fetchBakersRewardPeriod').mockImplementation(fetchBakersSpy);

      const result = await fetcher.fetchAllValidators();

      expect(result.validators).toHaveLength(150);
      // Should only call fetchBakersRewardPeriod once (efficient stream)
      expect(fetchBakersSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('caching', () => {
    it('caches results for configured duration', async () => {
      const mockBakers = [createMockBakerRewardPeriodInfo(1, BigInt('100000000000'))];
      const fetchBakersSpy = vi.fn().mockResolvedValue(mockBakers);

      vi.spyOn(fetcher as any, 'fetchBakersRewardPeriod').mockImplementation(fetchBakersSpy);

      // First call
      await fetcher.fetchAllValidators();
      // Second call (should use cache)
      await fetcher.fetchAllValidators();

      // fetchBakersRewardPeriod should only be called once due to caching
      expect(fetchBakersSpy).toHaveBeenCalledTimes(1);
    });

    it('invalidates cache after TTL expires', async () => {
      const cachingFetcher = new ValidatorFetcher(
        'grpc.mainnet.concordium.software',
        20000,
        { cacheTtlMs: 100 } // 100ms cache
      );

      const mockBakers = [createMockBakerRewardPeriodInfo(1, BigInt('100000000000'))];
      const fetchBakersSpy = vi.fn().mockResolvedValue(mockBakers);

      vi.spyOn(cachingFetcher as any, 'fetchBakersRewardPeriod').mockImplementation(fetchBakersSpy);

      // First call
      await cachingFetcher.fetchAllValidators();

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Second call (cache expired, should fetch again)
      await cachingFetcher.fetchAllValidators();

      expect(fetchBakersSpy).toHaveBeenCalledTimes(2);
    });

    it('allows force refresh to bypass cache', async () => {
      const mockBakers = [createMockBakerRewardPeriodInfo(1, BigInt('100000000000'))];
      const fetchBakersSpy = vi.fn().mockResolvedValue(mockBakers);

      vi.spyOn(fetcher as any, 'fetchBakersRewardPeriod').mockImplementation(fetchBakersSpy);

      // First call
      await fetcher.fetchAllValidators();
      // Second call with force refresh
      await fetcher.fetchAllValidators({ forceRefresh: true });

      expect(fetchBakersSpy).toHaveBeenCalledTimes(2);
    });
  });
});

/**
 * Helper to create mock BakerRewardPeriodInfo matching gRPC response structure
 */
function createMockBakerRewardPeriodInfo(
  bakerId: number,
  totalStake: bigint,
  overrides: Partial<{
    equityCapital: bigint;
    delegatedCapital: bigint;
    effectiveStake: bigint;
    commissionRates: { baking: number; finalization: number; transaction: number };
    isFinalizer: boolean;
  }> = {}
) {
  const equityCapital = overrides.equityCapital ?? totalStake;
  const delegatedCapital = overrides.delegatedCapital ?? BigInt(0);
  const effectiveStake = overrides.effectiveStake ?? totalStake;

  return {
    baker: {
      bakerId: BigInt(bakerId),
    },
    effectiveStake,
    equityCapital,
    delegatedCapital,
    commissionRates: {
      transactionCommission: overrides.commissionRates?.transaction ?? 0.1,
      bakingCommission: overrides.commissionRates?.baking ?? 0.1,
      finalizationCommission: overrides.commissionRates?.finalization ?? 0.1,
    },
    isFinalizer: overrides.isFinalizer ?? false,
  };
}
