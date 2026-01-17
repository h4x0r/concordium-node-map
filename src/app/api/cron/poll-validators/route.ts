import { NextResponse } from 'next/server';
import { getDbClient, initializeSchema } from '@/lib/db/client';
import { PollService } from '@/lib/poll-service';
import type { NodeSummary } from '@/lib/db/NodeTracker';

// Fluid Compute (Pro plan): 300s default, 800s max
// This endpoint focuses solely on validators - should complete in ~30s
export const maxDuration = 120;

// Force Node.js runtime for gRPC support
export const runtime = 'nodejs';

// Prevent caching
export const dynamic = 'force-dynamic';

// Concordium dashboard API
const NODES_SUMMARY_URL = 'https://dashboard.mainnet.concordium.software/nodesSummary';

// Secret to protect the cron endpoint
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Fetch nodes from the Concordium dashboard API (minimal data for validator linking)
 */
async function fetchNodesSummary(): Promise<NodeSummary[]> {
  const response = await fetch(NODES_SUMMARY_URL, {
    headers: { 'Accept': 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch nodes: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.map((node: Record<string, unknown>) => ({
    nodeId: node.nodeId as string,
    nodeName: node.nodeName as string,
    peerType: node.peerType as string,
    client: node.client as string,
    peersCount: node.peersCount as number,
    averagePing: node.averagePing as number | null,
    uptime: node.uptime as number,
    finalizedBlockHeight: node.finalizedBlockHeight as number,
    bestBlockHeight: node.bestBlockHeight as number,
    consensusRunning: node.consensusRunning as boolean,
    averageBytesPerSecondIn: node.averageBytesPerSecondIn as number | null,
    averageBytesPerSecondOut: node.averageBytesPerSecondOut as number | null,
  }));
}

/**
 * Process validators only - separated from main poll for timeout management
 */
async function processValidatorJob() {
  const timings: Record<string, number> = {};
  const startTime = Date.now();

  // Initialize database
  await initializeSchema();
  const db = getDbClient();
  const pollService = new PollService(db);
  timings['init'] = Date.now() - startTime;

  // Fetch nodes (needed for linking validators to reporting nodes)
  const fetchStart = Date.now();
  const nodes = await fetchNodesSummary();
  timings['fetchNodes'] = Date.now() - fetchStart;

  if (nodes.length === 0) {
    return { error: 'No nodes returned from API', status: 502 };
  }

  // Process validators (the main purpose of this endpoint)
  const validatorStart = Date.now();
  const validatorStats = await pollService.processValidators(nodes);
  timings['validators'] = Date.now() - validatorStart;

  timings['total'] = Date.now() - startTime;

  return {
    success: true,
    mode: 'validators-only',
    timestamp: Date.now(),
    nodesForLinking: nodes.length,
    validatorTracking: {
      totalValidators: validatorStats.totalValidators,
      visibleValidators: validatorStats.visibleValidators,
      phantomValidators: validatorStats.phantomValidators,
      newValidators: validatorStats.newValidators,
      stakeVisibilityPct: Math.round(validatorStats.stakeVisibilityPct * 10) / 10,
      quorumHealth: validatorStats.quorumHealth,
      fetchErrors: validatorStats.fetchErrors.length > 0 ? validatorStats.fetchErrors : undefined,
    },
    timings,
  };
}

/**
 * GET /api/cron/poll-validators
 * Dedicated validator polling - runs separately from main node poll
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const result = await processValidatorJob();

      if ('error' in result && result.status) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      return NextResponse.json(result);
    } catch (error) {
      console.error('Error polling validators:', error);
      return NextResponse.json(
        {
          error: 'Failed to poll validators',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  }

  // No auth - return endpoint info
  return NextResponse.json({
    endpoint: '/api/cron/poll-validators',
    method: 'GET (with auth)',
    description: 'Poll Concordium validators separately from node tracking',
    protected: !!CRON_SECRET,
  });
}
