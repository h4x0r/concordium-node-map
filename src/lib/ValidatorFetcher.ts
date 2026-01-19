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

/**
 * Diagnostics for account address fetching
 * Tracks success rates across different fetch methods
 */
export interface FetchDiagnostics {
  totalBakers: number;
  addressesFromPool: number;      // Primary method: getPoolInfo
  addressesFromAccount: number;   // Fallback method: getAccountInfo
  noAddressFound: number;
  failedBakerIds: number[];
}

export interface FetchResult {
  validators: ChainValidator[];
  totalFetched: number;
  totalNetworkStake: bigint;
  errors: string[];
  fetchedAt: number;
  diagnostics?: FetchDiagnostics;
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
   * Also fetches account addresses using getPoolInfo
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
    let diagnostics: FetchDiagnostics | undefined;

    try {
      // Fetch all bakers in a single efficient stream
      const bakersInfo = await this.fetchBakersRewardPeriod();

      // First pass: collect all and calculate total stake
      for (const info of bakersInfo) {
        const totalStake = info.equityCapital + info.delegatedCapital;
        totalNetworkStake += totalStake;
      }

      // Fetch account addresses for all bakers (batched for efficiency)
      const bakerIds = bakersInfo.map((info) => info.baker.bakerId);
      let addressMap = new Map<number, string>();
      try {
        const result = await this.fetchBakerAccountAddresses(bakerIds);
        addressMap = result.addressMap;
        diagnostics = result.diagnostics;
      } catch (err) {
        errors.push(`Failed to fetch account addresses: ${err instanceof Error ? err.message : 'Unknown error'}`);
        // Continue without addresses - better to have partial data
      }

      // Second pass: transform to ChainValidator with lottery power and address
      for (const info of bakersInfo) {
        try {
          const bakerId = Number(info.baker.bakerId);
          const accountAddress = addressMap.get(bakerId) || '';
          const validator = this.transformToChainValidator(info, totalNetworkStake, accountAddress);
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
      diagnostics,
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
    totalNetworkStake: bigint,
    accountAddress: string = ''
  ): ChainValidator {
    const bakerId = Number(info.baker.bakerId);
    const totalStake = info.equityCapital + info.delegatedCapital;

    // Calculate lottery power as proportion of total network stake
    const lotteryPower = totalNetworkStake > BigInt(0)
      ? Number(totalStake) / Number(totalNetworkStake)
      : 0;

    return {
      bakerId,
      accountAddress,
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

  /**
   * Retry a function with exponential backoff
   * Used for transient network failures
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: { maxRetries?: number; baseDelayMs?: number; bakerId?: number } = {}
  ): Promise<T> {
    const { maxRetries = 2, baseDelayMs = 300 } = options;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        if (attempt === maxRetries) break;
        // Exponential backoff: 300ms, 600ms, 1200ms
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  /**
   * Fetch a baker's account address with fallback logic
   * Primary: getPoolInfo (returns bakerAddress directly)
   * Fallback: getAccountInfo by account index (baker_id = account_index in Concordium)
   */
  private async fetchBakerAddress(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: any,
    bakerId: bigint
  ): Promise<{ address: string; source: 'pool' | 'account' | 'none' }> {
    // Primary: Try getPoolInfo with retry
    try {
      const poolStatus = await this.retryWithBackoff<{ bakerAddress?: { toString(): string } }>(
        () => client.getPoolInfo(bakerId),
        { bakerId: Number(bakerId) }
      );
      const address = poolStatus?.bakerAddress?.toString() || '';
      if (address) return { address, source: 'pool' };
    } catch {
      // getPoolInfo failed after retries, try fallback
    }

    // Fallback: Try getAccountInfo by account index (baker_id = account_index)
    try {
      const accountInfo = await this.retryWithBackoff<{ accountAddress?: { toString(): string } }>(
        () => client.getAccountInfo({ index: bakerId }),
        { bakerId: Number(bakerId) }
      );
      const address = accountInfo?.accountAddress?.toString() || '';
      if (address) return { address, source: 'account' };
    } catch {
      // Both methods failed
    }

    return { address: '', source: 'none' };
  }

  /**
   * Fetch account addresses for arbitrary baker IDs
   * Uses getAccountInfo fallback (baker_id = account_index in Concordium)
   * Can be used to fill in missing addresses for stale validators
   */
  async fetchAddressesForBakerIds(
    bakerIds: number[]
  ): Promise<{ addressMap: Map<number, string>; diagnostics: FetchDiagnostics }> {
    const bigintIds = bakerIds.map((id) => BigInt(id));
    return this.fetchBakerAccountAddresses(bigintIds);
  }

  /**
   * Fetch account addresses for bakers using getPoolInfo with fallback to getAccountInfo
   * Returns a map of bakerId -> accountAddress and diagnostics
   */
  protected async fetchBakerAccountAddresses(
    bakerIds: bigint[]
  ): Promise<{ addressMap: Map<number, string>; diagnostics: FetchDiagnostics }> {
    const { ConcordiumGRPCNodeClient, credentials } = await import(
      '@concordium/web-sdk/nodejs'
    );

    const client = new ConcordiumGRPCNodeClient(
      this.host,
      this.port,
      credentials.createSsl(),
      { timeout: this.timeout }
    );

    const addressMap = new Map<number, string>();
    const diagnostics: FetchDiagnostics = {
      totalBakers: bakerIds.length,
      addressesFromPool: 0,
      addressesFromAccount: 0,
      noAddressFound: 0,
      failedBakerIds: [],
    };

    // Fetch in batches to avoid overwhelming the node
    const BATCH_SIZE = 20;
    for (let i = 0; i < bakerIds.length; i += BATCH_SIZE) {
      const batch = bakerIds.slice(i, i + BATCH_SIZE);

      // Fetch batch in parallel using the new fetchBakerAddress method
      const promises = batch.map(async (bakerId) => {
        const result = await this.fetchBakerAddress(client, bakerId);
        return { bakerId: Number(bakerId), ...result };
      });

      const results = await Promise.all(promises);
      for (const { bakerId, address, source } of results) {
        if (address) {
          addressMap.set(bakerId, address);
          if (source === 'pool') {
            diagnostics.addressesFromPool++;
          } else if (source === 'account') {
            diagnostics.addressesFromAccount++;
          }
        } else {
          diagnostics.noAddressFound++;
          diagnostics.failedBakerIds.push(bakerId);
        }
      }
    }

    // Log diagnostics for debugging
    if (diagnostics.addressesFromAccount > 0 || diagnostics.noAddressFound > 0) {
      console.log(
        `[ValidatorFetcher] Address fetch diagnostics: ` +
        `pool=${diagnostics.addressesFromPool}, ` +
        `account_fallback=${diagnostics.addressesFromAccount}, ` +
        `failed=${diagnostics.noAddressFound}` +
        (diagnostics.failedBakerIds.length > 0
          ? ` (bakers: ${diagnostics.failedBakerIds.slice(0, 10).join(', ')}${diagnostics.failedBakerIds.length > 10 ? '...' : ''})`
          : '')
      );
    }

    return { addressMap, diagnostics };
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
