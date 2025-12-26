import type { Client } from '@libsql/client';
import type { PeerRecord, PeerConnectionRecord, PeerSource, CatchupStatus } from './schema';

export type { PeerRecord, PeerSource, CatchupStatus };

export interface UpsertPeerOptions {
  peerId: string;
  source: PeerSource;
  nodeName?: string;
  clientVersion?: string;
  ipAddress?: string;
  port?: number;
  catchupStatus?: CatchupStatus;
  grpcLatencyMs?: number;
  packetsSent?: number;
  packetsReceived?: number;
}

export interface GeoData {
  country: string;
  city: string;
  lat: number;
  lon: number;
  isp: string;
}

/**
 * Tracks all known peers including reporting nodes, gRPC peers, and inferred EXT nodes
 */
export class PeerTracker {
  constructor(private db: Client) {}

  /**
   * Insert or update a peer record
   * Preserves first_seen, updates last_seen
   */
  async upsertPeer(options: UpsertPeerOptions): Promise<void> {
    const now = Date.now();

    // Check if peer exists
    const existing = await this.getPeer(options.peerId);

    if (existing) {
      // Update existing peer
      await this.db.execute({
        sql: `UPDATE peers SET
          source = CASE WHEN ? IN ('reporting', 'grpc') THEN ? ELSE source END,
          last_seen = ?,
          node_name = COALESCE(?, node_name),
          client_version = COALESCE(?, client_version),
          ip_address = COALESCE(?, ip_address),
          port = COALESCE(?, port),
          catchup_status = COALESCE(?, catchup_status),
          grpc_latency_ms = COALESCE(?, grpc_latency_ms),
          packets_sent = COALESCE(?, packets_sent),
          packets_received = COALESCE(?, packets_received)
        WHERE peer_id = ?`,
        args: [
          options.source,
          options.source,
          now,
          options.nodeName ?? null,
          options.clientVersion ?? null,
          options.ipAddress ?? null,
          options.port ?? null,
          options.catchupStatus ?? null,
          options.grpcLatencyMs ?? null,
          options.packetsSent ?? null,
          options.packetsReceived ?? null,
          options.peerId,
        ],
      });
    } else {
      // Insert new peer
      await this.db.execute({
        sql: `INSERT INTO peers (
          peer_id, source, first_seen, last_seen,
          node_name, client_version,
          ip_address, port,
          catchup_status, grpc_latency_ms, packets_sent, packets_received
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          options.peerId,
          options.source,
          now,
          now,
          options.nodeName ?? null,
          options.clientVersion ?? null,
          options.ipAddress ?? null,
          options.port ?? null,
          options.catchupStatus ?? null,
          options.grpcLatencyMs ?? null,
          options.packetsSent ?? null,
          options.packetsReceived ?? null,
        ],
      });
    }
  }

  /**
   * Get a peer by ID
   */
  async getPeer(peerId: string): Promise<PeerRecord | null> {
    const result = await this.db.execute({
      sql: `SELECT * FROM peers WHERE peer_id = ?`,
      args: [peerId],
    });

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToPeerRecord(result.rows[0]);
  }

  /**
   * Get all peers
   */
  async getAllPeers(): Promise<PeerRecord[]> {
    const result = await this.db.execute(`SELECT * FROM peers`);
    return result.rows.map((row) => this.rowToPeerRecord(row));
  }

  /**
   * Get peers by source type
   */
  async getInferredPeers(): Promise<PeerRecord[]> {
    const result = await this.db.execute({
      sql: `SELECT * FROM peers WHERE source = ?`,
      args: ['inferred'],
    });
    return result.rows.map((row) => this.rowToPeerRecord(row));
  }

  /**
   * Update geo data for a peer
   */
  async updateGeoData(peerId: string, geo: GeoData): Promise<void> {
    const now = Date.now();
    await this.db.execute({
      sql: `UPDATE peers SET
        geo_country = ?,
        geo_city = ?,
        geo_lat = ?,
        geo_lon = ?,
        geo_isp = ?,
        geo_updated = ?
      WHERE peer_id = ?`,
      args: [geo.country, geo.city, geo.lat, geo.lon, geo.isp, now, peerId],
    });
  }

  /**
   * Record a peer connection (reporter sees peer)
   */
  async recordConnection(reporterId: string, peerId: string): Promise<void> {
    const now = Date.now();
    await this.db.execute({
      sql: `INSERT INTO peer_connections (reporter_id, peer_id, last_seen)
            VALUES (?, ?, ?)
            ON CONFLICT(reporter_id, peer_id) DO UPDATE SET last_seen = ?`,
      args: [reporterId, peerId, now, now],
    });
  }

  /**
   * Get all connections for a peer (who sees this peer)
   */
  async getConnectionsForPeer(peerId: string): Promise<PeerConnectionRecord[]> {
    const result = await this.db.execute({
      sql: `SELECT * FROM peer_connections WHERE peer_id = ?`,
      args: [peerId],
    });

    return result.rows.map((row) => ({
      reporter_id: row.reporter_id as string,
      peer_id: row.peer_id as string,
      last_seen: Number(row.last_seen),
    }));
  }

  /**
   * Get count of reporters that see a peer
   */
  async getSeenByCount(peerId: string): Promise<number> {
    const result = await this.db.execute({
      sql: `SELECT COUNT(*) as count FROM peer_connections WHERE peer_id = ?`,
      args: [peerId],
    });

    return Number(result.rows[0].count);
  }

  /**
   * Update seen_by_count for a peer based on peer_connections
   */
  async updateSeenByCount(peerId: string): Promise<void> {
    const count = await this.getSeenByCount(peerId);
    await this.db.execute({
      sql: `UPDATE peers SET seen_by_count = ? WHERE peer_id = ?`,
      args: [count, peerId],
    });
  }

  /**
   * Get peers that need geo lookup (have IP but no/stale geo data)
   */
  async getPeersNeedingGeoLookup(staleDays: number = 7): Promise<PeerRecord[]> {
    const staleTime = Date.now() - staleDays * 24 * 60 * 60 * 1000;

    const result = await this.db.execute({
      sql: `SELECT * FROM peers
            WHERE ip_address IS NOT NULL
            AND (geo_updated IS NULL OR geo_updated < ?)`,
      args: [staleTime],
    });

    return result.rows.map((row) => this.rowToPeerRecord(row));
  }

  /**
   * Detect and mark bootstrapper nodes
   * Bootstrappers have high connectivity (seen by many) and are stable (old)
   */
  async detectBootstrappers(minSeenBy: number = 10, minAgeDays: number = 7): Promise<void> {
    const minAge = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;

    // Reset all bootstrapper flags
    await this.db.execute(`UPDATE peers SET is_bootstrapper = 0`);

    // Mark peers that meet criteria
    await this.db.execute({
      sql: `UPDATE peers SET is_bootstrapper = 1
            WHERE seen_by_count >= ?
            AND first_seen <= ?`,
      args: [minSeenBy, minAge],
    });
  }

  /**
   * Convert a database row to PeerRecord
   */
  private rowToPeerRecord(row: Record<string, unknown>): PeerRecord {
    return {
      peer_id: row.peer_id as string,
      source: row.source as PeerSource,
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
      catchup_status: row.catchup_status as CatchupStatus | null,
      grpc_latency_ms: row.grpc_latency_ms !== null ? Number(row.grpc_latency_ms) : null,
      packets_sent: row.packets_sent !== null ? Number(row.packets_sent) : null,
      packets_received: row.packets_received !== null ? Number(row.packets_received) : null,
    };
  }
}
