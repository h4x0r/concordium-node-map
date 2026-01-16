/**
 * ValidatorFetcher - Fetches all validators from Concordium chain via gRPC
 *
 * Uses getBakerList() to enumerate all registered bakers
 * Uses getPoolInfo() to fetch detailed pool status for each baker
 * Returns ChainValidator[] format for ValidatorTracker
 */

import type { ChainValidator } from './db/ValidatorTracker';

export interface FetchOptions {
  forceRefresh?: boolean;
}

export interface FetchResult {
  validators: ChainValidator[];
  totalFetched: number;
  totalNetworkStake: bigint;
  errors: string[];
  fetchedAt: number;
}

export interface ValidatorFetcherOptions {
  concurrencyLimit?: number;
  cacheTtlMs?: number;
  timeout?: number;
}

// Default configuration
const DEFAULT_CONCURRENCY_LIMIT = 10;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Raw pool info structure from gRPC getPoolInfo
 */
interface RawPoolInfo {
  baker?: { value: bigint };
  address?: { value: string };
  equityCapital?: { value: bigint };
  delegatedCapital?: { value: bigint };
  poolInfo?: {
    openStatus?: { tag: string };
    commissionRates?: {
      baking?: { partsPerHundredThousand: number };
      finalization?: { partsPerHundredThousand: number };
      transaction?: { partsPerHundredThousand: number };
    };
  };
  currentPaydayInfo?: {
    effectiveStake?: { value: bigint };
  };
  allPoolTotalCapital?: { value: bigint };
  isSuspended?: boolean;
  _computedLotteryPower?: number;
}

/**
 * Raw baker ID structure from gRPC getBakerList
 */
interface RawBakerId {
  value: bigint;
}

export class ValidatorFetcher {
  private host: string;
  private port: number;
  private concurrencyLimit: number;
  private cacheTtlMs: number;
  private timeout: number;

  // Cache for fetch results
  private cache: FetchResult | null = null;
  private cacheTimestamp: number = 0;

  constructor(host: string, port: number, options?: ValidatorFetcherOptions) {
    this.host = host;
    this.port = port;
    this.concurrencyLimit = options?.concurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT;
    this.cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Fetch all validators from the chain
   * Returns cached result if available and not expired
   */
  async fetchAllValidators(options?: FetchOptions): Promise<FetchResult> {
    // Check cache unless force refresh
    if (!options?.forceRefresh && this.isCacheValid()) {
      return this.cache!;
    }

    const errors: string[] = [];
    const validators: ChainValidator[] = [];
    let totalNetworkStake = BigInt(0);

    try {
      // Step 1: Get all baker IDs
      const bakerIds = await this.fetchBakerList();

      // Step 2: Fetch pool info for each baker in parallel with concurrency limit
      const poolInfoResults = await this.fetchPoolInfoBatch(bakerIds, errors);

      // Step 3: Transform to ChainValidator format
      for (const [bakerId, poolInfo] of poolInfoResults) {
        try {
          const validator = this.transformToChainValidator(bakerId, poolInfo, totalNetworkStake);
          validators.push(validator);
          totalNetworkStake += validator.totalStake;
        } catch (err) {
          errors.push(`Failed to transform baker ${bakerId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Calculate lottery power now that we know total stake
      if (totalNetworkStake > BigInt(0)) {
        for (const validator of validators) {
          validator.lotteryPower = Number(validator.totalStake) / Number(totalNetworkStake);
        }
      }
    } catch (err) {
      errors.push(`Failed to fetch baker list: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    const result: FetchResult = {
      validators,
      totalFetched: validators.length,
      totalNetworkStake,
      errors,
      fetchedAt: Date.now(),
    };

    // Update cache
    this.cache = result;
    this.cacheTimestamp = Date.now();

    return result;
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    if (!this.cache) return false;
    return Date.now() - this.cacheTimestamp < this.cacheTtlMs;
  }

  /**
   * Fetch list of all baker IDs from chain
   * Internal method that can be mocked in tests
   */
  protected async fetchBakerList(): Promise<RawBakerId[]> {
    const { ConcordiumGRPCNodeClient, credentials } = await import(
      '@concordium/web-sdk/nodejs'
    );

    const client = new ConcordiumGRPCNodeClient(
      this.host,
      this.port,
      credentials.createSsl(),
      { timeout: this.timeout }
    );

    const bakerIds: RawBakerId[] = [];

    // getBakerList returns a stream of baker IDs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await (client as any).getBakerList({ type: 'best' });

    for await (const bakerId of stream) {
      bakerIds.push({ value: BigInt(bakerId.value ?? bakerId) });
    }

    return bakerIds;
  }

  /**
   * Fetch pool info for a single baker
   * Internal method that can be mocked in tests
   */
  protected async fetchPoolInfo(bakerId: number): Promise<RawPoolInfo> {
    const { ConcordiumGRPCNodeClient, credentials } = await import(
      '@concordium/web-sdk/nodejs'
    );

    const client = new ConcordiumGRPCNodeClient(
      this.host,
      this.port,
      credentials.createSsl(),
      { timeout: this.timeout }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (client as any).getPoolInfo(
      { type: 'best' },
      { value: BigInt(bakerId) }
    );

    return response as RawPoolInfo;
  }

  /**
   * Fetch pool info for multiple bakers with concurrency limiting
   */
  private async fetchPoolInfoBatch(
    bakerIds: RawBakerId[],
    errors: string[]
  ): Promise<Map<number, RawPoolInfo>> {
    const results = new Map<number, RawPoolInfo>();

    // Process in batches respecting concurrency limit
    for (let i = 0; i < bakerIds.length; i += this.concurrencyLimit) {
      const batch = bakerIds.slice(i, i + this.concurrencyLimit);

      const batchPromises = batch.map(async (bakerId) => {
        const id = Number(bakerId.value);
        try {
          const poolInfo = await this.fetchPoolInfo(id);
          return { id, poolInfo, error: null };
        } catch (err) {
          return {
            id,
            poolInfo: null,
            error: `Baker ${id}: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        if (result.poolInfo) {
          results.set(result.id, result.poolInfo);
        }
        if (result.error) {
          errors.push(result.error);
        }
      }
    }

    return results;
  }

  /**
   * Transform raw pool info to ChainValidator format
   */
  private transformToChainValidator(
    bakerId: number,
    poolInfo: RawPoolInfo,
    _totalNetworkStake: bigint
  ): ChainValidator {
    const equityCapital = poolInfo.equityCapital?.value ?? BigInt(0);
    const delegatedCapital = poolInfo.delegatedCapital?.value ?? BigInt(0);
    const totalStake = equityCapital + delegatedCapital;

    // Extract commission rates (stored as parts per 100,000)
    const commissionRates = poolInfo.poolInfo?.commissionRates;
    const bakingCommission = (commissionRates?.baking?.partsPerHundredThousand ?? 10000) / 100000;
    const finalizationCommission = (commissionRates?.finalization?.partsPerHundredThousand ?? 10000) / 100000;
    const transactionCommission = (commissionRates?.transaction?.partsPerHundredThousand ?? 10000) / 100000;

    // Extract open status
    const openStatus = poolInfo.poolInfo?.openStatus?.tag ?? 'openForAll';

    // Check if in current payday (has effective stake info)
    const inCurrentPayday = poolInfo.currentPaydayInfo !== undefined;
    const effectiveStake = poolInfo.currentPaydayInfo?.effectiveStake?.value ?? totalStake;

    // Lottery power will be calculated after we know total network stake
    // Use pre-computed value if available (for mocked tests)
    const lotteryPower = poolInfo._computedLotteryPower ?? 0;

    return {
      bakerId,
      accountAddress: poolInfo.address?.value ?? '',
      equityCapital,
      delegatedCapital,
      totalStake,
      lotteryPower,
      openStatus,
      commissionRates: {
        baking: bakingCommission,
        finalization: finalizationCommission,
        transaction: transactionCommission,
      },
      inCurrentPayday,
      effectiveStake,
    };
  }
}

/**
 * Create a ValidatorFetcher for Concordium mainnet
 */
export function createMainnetValidatorFetcher(
  options?: ValidatorFetcherOptions
): ValidatorFetcher {
  return new ValidatorFetcher(
    'grpc.mainnet.concordium.software',
    20000,
    options
  );
}
