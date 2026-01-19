import { NextResponse } from 'next/server';
import { getDbClient, initializeSchema } from '@/lib/db/client';
import { BlockTracker } from '@/lib/db/BlockTracker';
import { createMainnetBlockFetcher } from '@/lib/BlockFetcher';

// Block polling is lightweight - 60s should be plenty
export const maxDuration = 60;

// Force Node.js runtime for gRPC support
export const runtime = 'nodejs';

// Prevent caching
export const dynamic = 'force-dynamic';

// Secret to protect the cron endpoint (read at runtime for testability)
function getCronSecret(): string | undefined {
  return process.env.CRON_SECRET;
}

// When no blocks recorded, start from this many blocks before chain head
const INITIAL_BLOCKS_LOOKBACK = 100;

interface BlockPollResult {
  success: boolean;
  timestamp: number;
  blockTracking: {
    previousHeight: number | null;
    latestHeight: number;
    blocksProcessed: number;
    uniqueBakers: number;
    unknownBakers: number[];
    skippedDuplicates: number;
    fetchErrors?: string[];
  };
  timings: Record<string, number>;
}

/**
 * Process block polling job
 */
async function processBlockJob(): Promise<BlockPollResult | { error: string; status: number }> {
  const timings: Record<string, number> = {};
  const startTime = Date.now();

  // Initialize database
  await initializeSchema();
  const db = getDbClient();
  timings['init'] = Date.now() - startTime;

  // Create trackers
  const blockTracker = new BlockTracker(db);
  const blockFetcher = createMainnetBlockFetcher({ timeout: 30000 });

  // Get the last recorded block height
  const getHeightStart = Date.now();
  let previousHeight = await blockTracker.getLatestBlockHeight();
  timings['getHeight'] = Date.now() - getHeightStart;

  // If no blocks recorded yet, start from recent blocks (not genesis)
  if (previousHeight === null) {
    const chainHeight = await blockFetcher.getLatestBlockHeight();
    if (chainHeight === null) {
      return { error: 'Failed to get chain height', status: 502 };
    }
    // Start from INITIAL_BLOCKS_LOOKBACK blocks before chain head
    previousHeight = Math.max(0, chainHeight - INITIAL_BLOCKS_LOOKBACK);
    console.log(`[poll-blocks] No blocks recorded, starting from height ${previousHeight}`);
  }

  // Fetch new blocks from chain
  const fetchStart = Date.now();
  const fetchResult = await blockFetcher.fetchBlocksSince(previousHeight);
  timings['fetchBlocks'] = Date.now() - fetchStart;

  // Process the fetched blocks
  const processStart = Date.now();
  const processResult = await blockTracker.processBlocks(fetchResult.blocks);
  timings['processBlocks'] = Date.now() - processStart;

  // Recalculate block counts for all validators (updates blocks_24h, blocks_7d)
  const recalcStart = Date.now();
  await blockTracker.recalculateBlockCounts();
  timings['recalculate'] = Date.now() - recalcStart;

  timings['total'] = Date.now() - startTime;

  return {
    success: true,
    timestamp: Date.now(),
    blockTracking: {
      previousHeight,
      latestHeight: fetchResult.latestHeight,
      blocksProcessed: processResult.blocksProcessed,
      uniqueBakers: processResult.uniqueBakers,
      unknownBakers: processResult.unknownBakers,
      skippedDuplicates: processResult.skippedDuplicates,
      fetchErrors: fetchResult.errors.length > 0 ? fetchResult.errors : undefined,
    },
    timings,
  };
}

/**
 * GET /api/cron/poll-blocks
 * Poll for new blocks from the Concordium chain
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = getCronSecret();

  if (authHeader) {
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const result = await processBlockJob();

      if ('error' in result && result.status) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      return NextResponse.json(result);
    } catch (error) {
      console.error('Error polling blocks:', error);
      return NextResponse.json(
        {
          error: 'Failed to poll blocks',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  }

  // No auth - return endpoint info
  return NextResponse.json({
    endpoint: '/api/cron/poll-blocks',
    method: 'GET (with auth)',
    description: 'Poll Concordium chain for new blocks and update validator block counts',
    protected: !!cronSecret,
  });
}
