import type { Client } from '@libsql/client';
import type { PeerTracker } from './PeerTracker';
import type { PeerRecord } from './schema';

export type LocationConfidence = 'low' | 'medium' | 'high';

export interface InferredLocation {
  lat: number;
  lon: number;
  confidence: LocationConfidence;
  sourceCount: number;
}

export interface InferenceResults {
  inferred: number;
  failed: number;
}

/**
 * Infers network topology and peer locations from connection data.
 * Uses centroid calculation from connected peers with known locations.
 */
export class InferenceEngine {
  constructor(
    private db: Client,
    private peerTracker: PeerTracker
  ) {}

  /**
   * Infer the location of a peer based on the locations of peers that see it.
   * Uses centroid (geographic mean) of connected peers with known locations.
   */
  async inferLocation(peerId: string): Promise<InferredLocation | null> {
    // Get all reporters that see this peer
    const connections = await this.db.execute({
      sql: `SELECT p.geo_lat, p.geo_lon
            FROM peer_connections pc
            JOIN peers p ON pc.reporter_id = p.peer_id
            WHERE pc.peer_id = ?
            AND p.geo_lat IS NOT NULL
            AND p.geo_lon IS NOT NULL`,
      args: [peerId],
    });

    if (connections.rows.length === 0) {
      return null;
    }

    // Calculate centroid
    let sumLat = 0;
    let sumLon = 0;
    const count = connections.rows.length;

    for (const row of connections.rows) {
      sumLat += Number(row.geo_lat);
      sumLon += Number(row.geo_lon);
    }

    const lat = sumLat / count;
    const lon = sumLon / count;

    // Determine confidence based on number of sources
    let confidence: LocationConfidence;
    if (count >= 3) {
      confidence = 'high';
    } else if (count >= 2) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      lat,
      lon,
      confidence,
      sourceCount: count,
    };
  }

  /**
   * Detect and mark bootstrapper nodes.
   * Bootstrappers have high connectivity (seen by many) and are stable (old).
   */
  async detectBootstrappers(
    minSeenBy: number = 10,
    minAgeDays: number = 7
  ): Promise<void> {
    await this.peerTracker.detectBootstrappers(minSeenBy, minAgeDays);
  }

  /**
   * Calculate network centrality score for a peer.
   * Higher score means more central to the network.
   * Currently uses simple seen_by_count as the metric.
   */
  async calculateNetworkCentrality(peerId: string): Promise<number> {
    const peer = await this.peerTracker.getPeer(peerId);
    if (!peer) {
      return 0;
    }
    return peer.seen_by_count;
  }

  /**
   * Get all inferred peers that don't have geo location data.
   * These are candidates for location inference.
   */
  async getInferredPeersWithoutLocation(): Promise<PeerRecord[]> {
    const result = await this.db.execute({
      sql: `SELECT * FROM peers
            WHERE geo_lat IS NULL
            OR geo_lon IS NULL`,
      args: [],
    });

    return result.rows.map((row) => this.rowToPeerRecord(row));
  }

  /**
   * Infer locations for all peers that don't have geo data.
   * Returns count of successfully inferred and failed inferences.
   */
  async inferAllLocations(): Promise<InferenceResults> {
    const peers = await this.getInferredPeersWithoutLocation();
    let inferred = 0;
    let failed = 0;

    for (const peer of peers) {
      const location = await this.inferLocation(peer.peer_id);
      if (location) {
        // Update the peer with inferred location
        await this.db.execute({
          sql: `UPDATE peers SET
                geo_lat = ?,
                geo_lon = ?,
                geo_updated = ?
              WHERE peer_id = ?`,
          args: [location.lat, location.lon, Date.now(), peer.peer_id],
        });
        inferred++;
      } else {
        failed++;
      }
    }

    return { inferred, failed };
  }

  /**
   * Convert a database row to PeerRecord
   */
  private rowToPeerRecord(row: Record<string, unknown>): PeerRecord {
    return {
      peer_id: row.peer_id as string,
      source: row.source as 'reporting' | 'grpc' | 'inferred',
      first_seen: Number(row.first_seen),
      last_seen: Number(row.last_seen),
      node_name: row.node_name as string | null,
      client_version: row.client_version as string | null,
      ip_address: row.ip_address as string | null,
      port: row.port !== null ? Number(row.port) : null,
      geo_country: row.geo_country as string | null,
      geo_city: row.geo_city as string | null,
      geo_lat: row.geo_lat !== null ? Number(row.geo_lat) : null,
      geo_lon: row.geo_lon !== null ? Number(row.geo_lon) : null,
      geo_isp: row.geo_isp as string | null,
      geo_updated: row.geo_updated !== null ? Number(row.geo_updated) : null,
      seen_by_count: Number(row.seen_by_count ?? 0),
      is_bootstrapper: Number(row.is_bootstrapper ?? 0),
      catchup_status: row.catchup_status as 'UPTODATE' | 'PENDING' | 'CATCHINGUP' | null,
      grpc_latency_ms: row.grpc_latency_ms !== null ? Number(row.grpc_latency_ms) : null,
      packets_sent: row.packets_sent !== null ? Number(row.packets_sent) : null,
      packets_received: row.packets_received !== null ? Number(row.packets_received) : null,
    };
  }
}
