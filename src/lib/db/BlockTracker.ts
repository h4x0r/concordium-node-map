/**
 * BlockTracker - Tracks block production by validators
 *
 * Records which baker produced each block for forensic analysis.
 * Calculates phantom block percentage and validator block counts.
 */

import type { Client } from '@libsql/client';

export interface BlockInfo {
  height: number;
  bakerId: number;
  timestamp: number;
  hash: string;
}

export interface ProcessBlocksResult {
  blocksProcessed: number;
  uniqueBakers: number;
  unknownBakers: number[];
  skippedDuplicates: number;
}

export interface BlockProductionStats {
  totalBlocks: number;
  blocksByVisible: number;
  blocksByPhantom: number;
  phantomBlockPct: number;
  timeWindowMs: number;
}

export interface TopProducer {
  bakerId: number;
  blockCount: number;
}

// Time windows for block count calculations
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

export class BlockTracker {
  private db: Client;

  constructor(db: Client) {
    this.db = db;
  }

  /**
   * Process a batch of blocks from the chain
   * Records block production and updates validator stats
   */
  async processBlocks(blocks: BlockInfo[]): Promise<ProcessBlocksResult> {
    const now = Date.now();
    let blocksProcessed = 0;
    let skippedDuplicates = 0;
    const uniqueBakers = new Set<number>();
    const unknownBakers: number[] = [];

    for (const block of blocks) {
      // Check if block already recorded
      const existing = await this.db.execute(
        'SELECT height FROM blocks WHERE height = ?',
        [block.height]
      );

      if (existing.rows.length > 0) {
        skippedDuplicates++;
        continue;
      }

      // Record the block
      await this.db.execute(
        `INSERT INTO blocks (height, hash, baker_id, timestamp, recorded_at)
         VALUES (?, ?, ?, ?, ?)`,
        [block.height, block.hash, block.bakerId, block.timestamp, now]
      );

      blocksProcessed++;
      uniqueBakers.add(block.bakerId);

      // Check if baker is known
      const validator = await this.db.execute(
        'SELECT baker_id FROM validators WHERE baker_id = ?',
        [block.bakerId]
      );

      if (validator.rows.length === 0) {
        if (!unknownBakers.includes(block.bakerId)) {
          unknownBakers.push(block.bakerId);
        }
      } else {
        // Update validator's last block info and increment block count
        await this.db.execute(
          `UPDATE validators SET
            last_block_height = CASE
              WHEN last_block_height IS NULL OR ? > last_block_height THEN ?
              ELSE last_block_height
            END,
            last_block_time = CASE
              WHEN last_block_time IS NULL OR ? > last_block_time THEN ?
              ELSE last_block_time
            END,
            blocks_24h = blocks_24h + 1
          WHERE baker_id = ?`,
          [block.height, block.height, block.timestamp, block.timestamp, block.bakerId]
        );
      }
    }

    return {
      blocksProcessed,
      uniqueBakers: uniqueBakers.size,
      unknownBakers,
      skippedDuplicates,
    };
  }

  /**
   * Calculate block production stats for visible vs phantom validators
   */
  async calculateBlockProductionStats(timeWindowMs: number): Promise<BlockProductionStats> {
    const cutoff = Date.now() - timeWindowMs;

    // Get all blocks in the time window with validator source
    const result = await this.db.execute(
      `SELECT
        b.baker_id,
        v.source
       FROM blocks b
       LEFT JOIN validators v ON b.baker_id = v.baker_id
       WHERE b.timestamp >= ?`,
      [cutoff]
    );

    let totalBlocks = 0;
    let blocksByVisible = 0;
    let blocksByPhantom = 0;

    for (const row of result.rows) {
      totalBlocks++;
      const source = row.source as string | null;

      if (source === 'reporting') {
        blocksByVisible++;
      } else {
        // chain_only or unknown (no validator record)
        blocksByPhantom++;
      }
    }

    const phantomBlockPct = totalBlocks > 0
      ? (blocksByPhantom / totalBlocks) * 100
      : 0;

    return {
      totalBlocks,
      blocksByVisible,
      blocksByPhantom,
      phantomBlockPct,
      timeWindowMs,
    };
  }

  /**
   * Get top block producers in the last 24 hours
   */
  async getTopBlockProducers(limit: number): Promise<TopProducer[]> {
    const cutoff = Date.now() - ONE_DAY_MS;

    const result = await this.db.execute(
      `SELECT baker_id, COUNT(*) as block_count
       FROM blocks
       WHERE timestamp >= ?
       GROUP BY baker_id
       ORDER BY block_count DESC
       LIMIT ?`,
      [cutoff, limit]
    );

    return result.rows.map((row) => ({
      bakerId: row.baker_id as number,
      blockCount: Number(row.block_count),
    }));
  }

  /**
   * Get blocks produced by a specific baker
   */
  async getBlocksByBaker(bakerId: number): Promise<BlockInfo[]> {
    const result = await this.db.execute(
      `SELECT height, hash, baker_id, timestamp
       FROM blocks
       WHERE baker_id = ?
       ORDER BY height DESC`,
      [bakerId]
    );

    return result.rows.map((row) => ({
      height: row.height as number,
      hash: row.hash as string,
      bakerId: row.baker_id as number,
      timestamp: row.timestamp as number,
    }));
  }

  /**
   * Recalculate blocks_24h and blocks_7d for all validators
   * Should be called periodically to update stale counts
   */
  async recalculateBlockCounts(): Promise<void> {
    const now = Date.now();
    const oneDayAgo = now - ONE_DAY_MS;
    const sevenDaysAgo = now - SEVEN_DAYS_MS;

    // Calculate 24h counts per baker
    const counts24h = await this.db.execute(
      `SELECT baker_id, COUNT(*) as count
       FROM blocks
       WHERE timestamp >= ?
       GROUP BY baker_id`,
      [oneDayAgo]
    );

    // Calculate 7d counts per baker
    const counts7d = await this.db.execute(
      `SELECT baker_id, COUNT(*) as count
       FROM blocks
       WHERE timestamp >= ?
       GROUP BY baker_id`,
      [sevenDaysAgo]
    );

    // Build maps for quick lookup
    const map24h = new Map<number, number>();
    for (const row of counts24h.rows) {
      map24h.set(row.baker_id as number, Number(row.count));
    }

    const map7d = new Map<number, number>();
    for (const row of counts7d.rows) {
      map7d.set(row.baker_id as number, Number(row.count));
    }

    // Get all validators
    const validators = await this.db.execute('SELECT baker_id FROM validators');

    // Update each validator
    for (const row of validators.rows) {
      const bakerId = row.baker_id as number;
      const blocks24h = map24h.get(bakerId) ?? 0;
      const blocks7d = map7d.get(bakerId) ?? 0;

      await this.db.execute(
        `UPDATE validators SET blocks_24h = ?, blocks_7d = ? WHERE baker_id = ?`,
        [blocks24h, blocks7d, bakerId]
      );
    }
  }

  /**
   * Get the highest block height we've recorded
   */
  async getLatestBlockHeight(): Promise<number | null> {
    const result = await this.db.execute(
      'SELECT MAX(height) as max_height FROM blocks'
    );

    const maxHeight = result.rows[0]?.max_height;
    return maxHeight !== null ? Number(maxHeight) : null;
  }

  /**
   * Clean up old blocks beyond retention period
   */
  async cleanupOldBlocks(retentionMs: number = 30 * ONE_DAY_MS): Promise<number> {
    const cutoff = Date.now() - retentionMs;

    const result = await this.db.execute(
      'DELETE FROM blocks WHERE timestamp < ?',
      [cutoff]
    );

    return result.rowsAffected;
  }
}
