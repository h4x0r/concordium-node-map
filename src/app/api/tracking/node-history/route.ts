import { NextResponse } from 'next/server';
import { getDbClient, initializeSchema } from '@/lib/db/client';
import { NodeTracker } from '@/lib/db/NodeTracker';

/**
 * GET /api/tracking/node-history
 *
 * Returns health history for a specific node
 *
 * Query params:
 * - nodeId: Node ID (required)
 * - since: Start timestamp (default: 24 hours ago)
 * - until: End timestamp (default: now)
 * - downsample: Downsample interval in minutes (optional, for large ranges)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const nodeId = searchParams.get('nodeId');
    if (!nodeId) {
      return NextResponse.json(
        { error: 'nodeId parameter is required' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const since = parseInt(searchParams.get('since') || String(now - 24 * 60 * 60 * 1000));
    const until = parseInt(searchParams.get('until') || String(now));
    const downsample = searchParams.get('downsample')
      ? parseInt(searchParams.get('downsample')!)
      : null;

    await initializeSchema();
    const db = getDbClient();
    const tracker = new NodeTracker(db);

    let history = await tracker.getNodeHealthHistory(nodeId, since, until);

    // Apply downsampling if requested
    if (downsample && downsample > 0 && history.length > 0) {
      const intervalMs = downsample * 60 * 1000;
      const downsampled: typeof history = [];
      let currentBucket = Math.floor(history[0].timestamp / intervalMs) * intervalMs;
      let bucketItems: typeof history = [];

      for (const item of history) {
        const bucket = Math.floor(item.timestamp / intervalMs) * intervalMs;
        if (bucket !== currentBucket && bucketItems.length > 0) {
          // Aggregate bucket - take the last item (most recent state)
          downsampled.push({
            ...bucketItems[bucketItems.length - 1],
            timestamp: currentBucket,
          });
          bucketItems = [];
          currentBucket = bucket;
        }
        bucketItems.push(item);
      }
      // Don't forget the last bucket
      if (bucketItems.length > 0) {
        downsampled.push({
          ...bucketItems[bucketItems.length - 1],
          timestamp: currentBucket,
        });
      }

      history = downsampled;
    }

    return NextResponse.json({
      success: true,
      nodeId,
      timeRange: {
        since,
        until,
        sinceISO: new Date(since).toISOString(),
        untilISO: new Date(until).toISOString(),
      },
      downsampleMinutes: downsample,
      dataPoints: history.length,
      history: history.map(h => ({
        timestamp: h.timestamp,
        timestampISO: new Date(h.timestamp).toISOString(),
        healthStatus: h.health_status,
        peersCount: h.peers_count,
        avgPing: h.avg_ping,
        finalizedHeight: h.finalized_height,
        heightDelta: h.height_delta,
        bytesIn: h.bytes_in,
        bytesOut: h.bytes_out,
      })),
    });
  } catch (error) {
    console.error('Error fetching node history:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch node history',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
