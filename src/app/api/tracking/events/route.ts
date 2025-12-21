import { NextResponse } from 'next/server';
import { getDbClient, initializeSchema } from '@/lib/db/client';

/**
 * GET /api/tracking/events
 *
 * Returns recent events (new nodes, restarts, health changes, etc.)
 *
 * Query params:
 * - since: Start timestamp (default: 24 hours ago)
 * - until: End timestamp (default: now)
 * - type: Filter by event type (optional)
 * - nodeId: Filter by node ID (optional)
 * - limit: Max events to return (default: 100)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const now = Date.now();
    const since = parseInt(searchParams.get('since') || String(now - 24 * 60 * 60 * 1000));
    const until = parseInt(searchParams.get('until') || String(now));
    const eventType = searchParams.get('type');
    const nodeId = searchParams.get('nodeId');
    const limit = parseInt(searchParams.get('limit') || '100');

    await initializeSchema();
    const db = getDbClient();

    // Build query dynamically
    let query = `
      SELECT e.*, n.node_name
      FROM events e
      LEFT JOIN nodes n ON e.node_id = n.node_id
      WHERE e.timestamp >= ? AND e.timestamp <= ?
    `;
    const params: (string | number)[] = [since, until];

    if (eventType) {
      query += ' AND e.event_type = ?';
      params.push(eventType);
    }

    if (nodeId) {
      query += ' AND e.node_id = ?';
      params.push(nodeId);
    }

    query += ' ORDER BY e.timestamp DESC LIMIT ?';
    params.push(limit);

    const result = await db.execute(query, params);

    return NextResponse.json({
      success: true,
      timeRange: {
        since,
        until,
        sinceISO: new Date(since).toISOString(),
        untilISO: new Date(until).toISOString(),
      },
      filters: {
        type: eventType,
        nodeId,
      },
      count: result.rows.length,
      events: result.rows.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        timestampISO: new Date(e.timestamp as number).toISOString(),
        nodeId: e.node_id,
        nodeName: e.node_name,
        eventType: e.event_type,
        oldValue: e.old_value,
        newValue: e.new_value,
        metadata: e.metadata ? JSON.parse(e.metadata as string) : null,
      })),
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch events',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
