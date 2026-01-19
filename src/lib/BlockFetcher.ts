/**
 * BlockFetcher - Fetches block data from Concordium chain via gRPC
 *
 * Used to track block production by validators.
 * Fetches block info including baker ID, timestamp, and transaction count.
 */

import type { BlockInfo } from './db/BlockTracker';

export interface BlockFetcherOptions {
  timeout?: number;
}

export interface ExtendedBlockInfo extends BlockInfo {
  transactionCount: number;
}

export interface FetchBlocksResult {
  blocks: ExtendedBlockInfo[];
  latestHeight: number;
  fromHeight: number;
  errors: string[];
}

// Limits to prevent overwhelming the node or timing out
const DEFAULT_TIMEOUT = 15000;
const MAX_BLOCKS_PER_FETCH = 100;

export class BlockFetcher {
  private host: string;
  private port: number;
  private timeout: number;

  constructor(host: string, port: number, options?: BlockFetcherOptions) {
    this.host = host;
    this.port = port;
    this.timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Fetch consensus info from gRPC (protected for mocking in tests)
   */
  protected async fetchConsensusInfo(): Promise<{ bestBlockHeight: bigint }> {
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
    return (client as any).getConsensusInfo();
  }

  /**
   * Fetch block hash at a specific height (protected for mocking in tests)
   */
  protected async fetchBlockHashAtHeight(height: number): Promise<string | null> {
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
    const blockHashes = await (client as any).getBlocksAtHeight(BigInt(height));
    if (!blockHashes || blockHashes.length === 0) {
      return null;
    }

    const hash = blockHashes[0];
    return typeof hash === 'string' ? hash : hash.toString();
  }

  /**
   * Fetch block info by hash (protected for mocking in tests)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async fetchBlockInfo(blockHash: string): Promise<any> {
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
    return (client as any).getBlockInfo(blockHash);
  }

  /**
   * Get the latest block height from consensus info
   */
  async getLatestBlockHeight(): Promise<number | null> {
    try {
      const consensusInfo = await this.fetchConsensusInfo();
      const height = consensusInfo.bestBlockHeight;
      return typeof height === 'bigint' ? Number(height) : Number(height);
    } catch (error) {
      console.error('[BlockFetcher] Failed to get latest block height:', error);
      return null;
    }
  }

  /**
   * Get block info at a specific height
   * Returns null if the block doesn't have a baker (genesis/special blocks)
   */
  async getBlockInfoAtHeight(height: number): Promise<ExtendedBlockInfo | null> {
    try {
      // Get block hash at height
      const blockHash = await this.fetchBlockHashAtHeight(height);
      if (!blockHash) {
        return null;
      }

      // Get block info
      const blockInfo = await this.fetchBlockInfo(blockHash);
      if (!blockInfo) {
        return null;
      }

      // Skip blocks without baker (genesis, special blocks)
      const blockBaker = blockInfo.blockBaker;
      if (blockBaker === undefined || blockBaker === null) {
        return null;
      }

      // Extract timestamp
      const blockSlotTime = blockInfo.blockSlotTime;
      const timestamp = blockSlotTime instanceof Date
        ? blockSlotTime.getTime()
        : typeof blockSlotTime === 'number'
          ? blockSlotTime
          : new Date(blockSlotTime).getTime();

      return {
        height,
        hash: blockHash,
        bakerId: typeof blockBaker === 'bigint' ? Number(blockBaker) : Number(blockBaker),
        timestamp,
        transactionCount: Number(blockInfo.transactionCount ?? 0),
      };
    } catch (error) {
      console.error(`[BlockFetcher] Failed to get block at height ${height}:`, error);
      return null;
    }
  }

  /**
   * Fetch blocks in a range (inclusive)
   * Limits to MAX_BLOCKS_PER_FETCH to prevent timeouts
   */
  async fetchBlockRange(fromHeight: number, toHeight: number): Promise<ExtendedBlockInfo[]> {
    const blocks: ExtendedBlockInfo[] = [];

    // Limit range
    const limitedToHeight = Math.min(toHeight, fromHeight + MAX_BLOCKS_PER_FETCH - 1);

    for (let height = fromHeight; height <= limitedToHeight; height++) {
      try {
        const block = await this.getBlockInfoAtHeight(height);
        if (block) {
          blocks.push(block);
        }
      } catch (error) {
        // Log and continue - don't fail entire batch for one block
        console.error(`[BlockFetcher] Error fetching block ${height}:`, error);
      }
    }

    return blocks;
  }

  /**
   * Fetch all blocks since a given height up to the latest
   * Returns the blocks and metadata about the fetch
   */
  async fetchBlocksSince(fromHeight: number): Promise<FetchBlocksResult> {
    const errors: string[] = [];

    // Get latest height
    const latestHeight = await this.getLatestBlockHeight();
    if (latestHeight === null) {
      return {
        blocks: [],
        latestHeight: fromHeight,
        fromHeight,
        errors: ['Failed to get latest block height'],
      };
    }

    // If no new blocks, return empty
    if (latestHeight <= fromHeight) {
      return {
        blocks: [],
        latestHeight,
        fromHeight,
        errors: [],
      };
    }

    // Fetch blocks from fromHeight + 1 to latest
    const startHeight = fromHeight + 1;
    const blocks = await this.fetchBlockRange(startHeight, latestHeight);

    // Check if we hit the limit
    if (latestHeight - startHeight >= MAX_BLOCKS_PER_FETCH) {
      errors.push(`Limited to ${MAX_BLOCKS_PER_FETCH} blocks. More blocks available.`);
    }

    return {
      blocks,
      latestHeight,
      fromHeight: startHeight,
      errors,
    };
  }
}

/**
 * Create a BlockFetcher for Concordium mainnet
 */
export function createMainnetBlockFetcher(options?: BlockFetcherOptions): BlockFetcher {
  return new BlockFetcher('grpc.mainnet.concordium.software', 20000, options);
}
