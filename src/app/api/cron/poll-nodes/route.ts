import { NextResponse } from 'next/server';
import { getDbClient, initializeSchema } from '@/lib/db/client';
import { NodeTracker, type NodeSummary } from '@/lib/db/NodeTracker';

// Concordium dashboard API
const NODES_SUMMARY_URL = 'https://dashboard.mainnet.concordium.software/nodesSummary';

// Secret to protect the cron endpoint (set in Vercel env)
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Fetch nodes from the Concordium dashboard API
 */
async function fetchNodesSummary(): Promise<NodeSummary[]> {
  const response = await fetch(NODES_SUMMARY_URL, {
    headers: {
      'Accept': 'application/json',
    },
    // Disable caching for fresh data
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch nodes: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Map API response to our NodeSummary type
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
 * POST /api/cron/poll-nodes
 *
 * Called by Vercel Cron or external cron service to poll nodes
 * Protected by CRON_SECRET header
 */
export async function POST(request: Request) {
  // Verify cron secret if configured
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  try {
    // Initialize database (idempotent)
    await initializeSchema();
    const db = getDbClient();
    const tracker = new NodeTracker(db);

    // Fetch current nodes
    const nodes = await fetchNodesSummary();

    if (nodes.length === 0) {
      return NextResponse.json(
        { error: 'No nodes returned from API' },
        { status: 502 }
      );
    }

    // Calculate max height for health calculation
    const maxHeight = Math.max(...nodes.map(n => n.finalizedBlockHeight));

    // Process nodes and detect changes
    const result = await tracker.processNodes(nodes, maxHeight);

    // Return summary
    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      nodesPolled: nodes.length,
      maxHeight,
      changes: {
        newNodes: result.newNodes.length,
        disappeared: result.disappeared.length,
        reappeared: result.reappeared.length,
        restarts: result.restarts.length,
        healthChanges: result.healthChanges.length,
      },
      snapshotsRecorded: result.snapshotsRecorded,
      // Include details for new nodes (for alerting)
      newNodeIds: result.newNodes,
      restartedNodeIds: result.restarts,
    });
  } catch (error) {
    console.error('Error polling nodes:', error);
    return NextResponse.json(
      {
        error: 'Failed to poll nodes',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET handler for testing/health check
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/cron/poll-nodes',
    method: 'POST',
    description: 'Poll Concordium nodes and track changes',
    protected: !!CRON_SECRET,
  });
}
