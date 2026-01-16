/**
 * ValidatorFetcher - Fetches all validators from Concordium chain via gRPC
 *
 * Uses getBakersRewardPeriod() to fetch all bakers in a single efficient stream
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
  cacheTtlMs?: number;
  timeout?: number;
}

// Default configuration
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_TIMEOUT = 15000; // 15 seconds - fail fast on Vercel if gRPC hangs

/**
 * Baker reward period info from gRPC getBakersRewardPeriod
 * Contains all info we need in a single stream response
 */
interface BakerRewardPeriodInfo {
  baker: {
    bakerId: bigint;
  };
  effectiveStake: bigint;
  equityCapital: bigint;
  delegatedCapital: bigint;
  commissionRates: {
    transactionCommission: number;
    bakingCommission: number;
    finalizationCommission: number;
  };
  isFinalizer: boolean;
}

export class ValidatorFetcher {
  private host: string;
  private port: number;
  private cacheTtlMs: number;
  private timeout: number;

  // Cache for fetch results
  private cache: FetchResult | null = null;
  private cacheTimestamp: number = 0;

  constructor(host: string, port: number, options?: ValidatorFetcherOptions) {
    this.host = host;
    this.port = port;
    this.cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Fetch all validators from the chain using efficient getBakersRewardPeriod
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
      // Fetch all bakers in a single efficient stream
      const bakersInfo = await this.fetchBakersRewardPeriod();

      // First pass: collect all and calculate total stake
      for (const info of bakersInfo) {
        const totalStake = info.equityCapital + info.delegatedCapital;
        totalNetworkStake += totalStake;
      }

      // Second pass: transform to ChainValidator with lottery power
      for (const info of bakersInfo) {
        try {
          const validator = this.transformToChainValidator(info, totalNetworkStake);
          validators.push(validator);
        } catch (err) {
          const bakerId = Number(info.baker.bakerId);
          errors.push(`Failed to transform baker ${bakerId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    } catch (err) {
      errors.push(`Failed to fetch bakers: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
   * Fetch all bakers using the efficient getBakersRewardPeriod stream
   * This is ~100x faster than fetching individual pool info for each baker
   */
  protected async fetchBakersRewardPeriod(): Promise<BakerRewardPeriodInfo[]> {
    const { ConcordiumGRPCNodeClient, credentials } = await import(
      '@concordium/web-sdk/nodejs'
    );

    const client = new ConcordiumGRPCNodeClient(
      this.host,
      this.port,
      credentials.createSsl(),
      { timeout: this.timeout }
    );

    const bakers: BakerRewardPeriodInfo[] = [];

    // getBakersRewardPeriod returns a stream of all bakers with their reward period info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = (client as any).getBakersRewardPeriod();

    for await (const baker of stream) {
      // Extract values from SDK types (CcdAmount uses BigInt internally)
      const equityCapital = typeof baker.equityCapital === 'bigint'
        ? baker.equityCapital
        : BigInt(baker.equityCapital?.microCcdAmount ?? baker.equityCapital?.value ?? 0);

      const delegatedCapital = typeof baker.delegatedCapital === 'bigint'
        ? baker.delegatedCapital
        : BigInt(baker.delegatedCapital?.microCcdAmount ?? baker.delegatedCapital?.value ?? 0);

      const effectiveStake = typeof baker.effectiveStake === 'bigint'
        ? baker.effectiveStake
        : BigInt(baker.effectiveStake?.microCcdAmount ?? baker.effectiveStake?.value ?? 0);

      bakers.push({
        baker: {
          bakerId: BigInt(baker.baker?.bakerId ?? 0),
        },
        effectiveStake,
        equityCapital,
        delegatedCapital,
        commissionRates: {
          transactionCommission: baker.commissionRates?.transactionCommission ?? 0.1,
          bakingCommission: baker.commissionRates?.bakingCommission ?? 0.1,
          finalizationCommission: baker.commissionRates?.finalizationCommission ?? 1,
        },
        isFinalizer: baker.isFinalizer ?? false,
      });
    }

    return bakers;
  }

  /**
   * Transform BakerRewardPeriodInfo to ChainValidator format
   */
  private transformToChainValidator(
    info: BakerRewardPeriodInfo,
    totalNetworkStake: bigint
  ): ChainValidator {
    const bakerId = Number(info.baker.bakerId);
    const totalStake = info.equityCapital + info.delegatedCapital;

    // Calculate lottery power as proportion of total network stake
    const lotteryPower = totalNetworkStake > BigInt(0)
      ? Number(totalStake) / Number(totalNetworkStake)
      : 0;

    return {
      bakerId,
      // Account address not available from getBakersRewardPeriod
      // Can be fetched separately if needed via getAccountInfo
      accountAddress: '',
      equityCapital: info.equityCapital,
      delegatedCapital: info.delegatedCapital,
      totalStake,
      lotteryPower,
      // Open status not available from this endpoint - default to open
      openStatus: 'openForAll',
      commissionRates: {
        baking: info.commissionRates.bakingCommission,
        finalization: info.commissionRates.finalizationCommission,
        transaction: info.commissionRates.transactionCommission,
      },
      // All bakers from reward period are in current payday
      inCurrentPayday: true,
      effectiveStake: info.effectiveStake,
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
