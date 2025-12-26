import { NextResponse } from 'next/server';
import { getDbClient, initializeSchema } from '@/lib/db/client';

/**
 * GET /api/peers
 *
 * Returns all peers with their source types and geo data
 */
export async function GET() {
  try {
    await initializeSchema();
    const db = getDbClient();

    // Get all peers with their data
    const result = await db.execute(`
      SELECT
        peer_id,
        source,
        first_seen,
        last_seen,
        node_name,
        client_version,
        ip_address,
        port,
        geo_country,
        geo_city,
        geo_lat,
        geo_lon,
        geo_isp,
        seen_by_count,
        is_bootstrapper,
        catchup_status,
        grpc_latency_ms
      FROM peers
      ORDER BY last_seen DESC
    `);

    const peers = result.rows.map((row) => ({
      peerId: row.peer_id as string,
      source: row.source as string,
      firstSeen: Number(row.first_seen),
      lastSeen: Number(row.last_seen),
      nodeName: row.node_name as string | null,
      clientVersion: row.client_version as string | null,
      ipAddress: row.ip_address as string | null,
      port: row.port !== null ? Number(row.port) : null,
      geoCountry: row.geo_country as string | null,
      geoCity: row.geo_city as string | null,
      geoLat: row.geo_lat !== null ? Number(row.geo_lat) : null,
      geoLon: row.geo_lon !== null ? Number(row.geo_lon) : null,
      geoIsp: row.geo_isp as string | null,
      seenByCount: Number(row.seen_by_count ?? 0),
      isBootstrapper: Number(row.is_bootstrapper ?? 0) === 1,
      catchupStatus: row.catchup_status as string | null,
      grpcLatencyMs: row.grpc_latency_ms !== null ? Number(row.grpc_latency_ms) : null,
    }));

    // Summary stats
    const stats = {
      total: peers.length,
      bySource: {
        reporting: peers.filter((p) => p.source === 'reporting').length,
        grpc: peers.filter((p) => p.source === 'grpc').length,
        inferred: peers.filter((p) => p.source === 'inferred').length,
      },
      withGeo: peers.filter((p) => p.geoLat !== null).length,
      bootstrappers: peers.filter((p) => p.isBootstrapper).length,
    };

    return NextResponse.json({
      peers,
      stats,
    });
  } catch (error) {
    console.error('Error fetching peers:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch peers',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
