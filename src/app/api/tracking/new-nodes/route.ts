import { NextResponse } from 'next/server';
import { getDbClient, initializeSchema } from '@/lib/db/client';
import { NodeTracker } from '@/lib/db/NodeTracker';

/**
 * GET /api/tracking/new-nodes
 *
 * Returns nodes that appeared in a given time range
 *
 * Query params:
 * - since: Start timestamp (default: 24 hours ago)
 * - until: End timestamp (default: now)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const now = Date.now();
    const since = parseInt(searchParams.get('since') || String(now - 24 * 60 * 60 * 1000));
    const until = parseInt(searchParams.get('until') || String(now));

    await initializeSchema();
    const db = getDbClient();
    const tracker = new NodeTracker(db);

    const newNodes = await tracker.getNewNodesInRange(since, until);

    return NextResponse.json({
      success: true,
      timeRange: {
        since,
        until,
        sinceISO: new Date(since).toISOString(),
        untilISO: new Date(until).toISOString(),
      },
      count: newNodes.length,
      nodes: newNodes.map(n => ({
        nodeId: n.node_id,
        nodeName: n.node_name,
        client: n.client,
        firstSeen: n.first_seen,
        firstSeenISO: new Date(n.first_seen).toISOString(),
        isActive: n.is_active === 1,
      })),
    });
  } catch (error) {
    console.error('Error fetching new nodes:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch new nodes',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
