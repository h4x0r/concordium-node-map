/**
 * Database schema for node tracking
 * Uses Turso (SQLite edge) for serverless deployment
 */

export const SCHEMA = {
  /**
   * Nodes table - stores static/slow-changing node info
   * Updated only when values change
   */
  nodes: `
    CREATE TABLE IF NOT EXISTS nodes (
      node_id TEXT PRIMARY KEY,
      node_name TEXT,
      client TEXT,
      peer_type TEXT,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1
    )
  `,

  /**
   * Node sessions - tracks uptime periods (restart detection)
   * A new session is created when uptime resets (node restart)
   */
  node_sessions: `
    CREATE TABLE IF NOT EXISTS node_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      end_reason TEXT,
      FOREIGN KEY (node_id) REFERENCES nodes(node_id)
    )
  `,

  /**
   * Snapshots - periodic health data (only changing fields)
   * Stored every poll interval for health trend analysis
   */
  snapshots: `
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      node_id TEXT NOT NULL,
      health_status TEXT NOT NULL,
      peers_count INTEGER,
      avg_ping REAL,
      finalized_height INTEGER,
      height_delta INTEGER,
      bytes_in REAL,
      bytes_out REAL,
      FOREIGN KEY (node_id) REFERENCES nodes(node_id)
    )
  `,

  /**
   * Events - significant state changes
   * Used for new node detection, health changes, etc.
   */
  events: `
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      node_id TEXT,
      event_type TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      metadata TEXT
    )
  `,

  /**
   * Network snapshots - aggregated network-wide metrics
   * Stored every poll for network pulse/health trends
   */
  network_snapshots: `
    CREATE TABLE IF NOT EXISTS network_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      total_nodes INTEGER NOT NULL,
      healthy_nodes INTEGER NOT NULL,
      lagging_nodes INTEGER NOT NULL,
      issue_nodes INTEGER NOT NULL,
      avg_peers REAL,
      avg_latency REAL,
      max_finalization_lag INTEGER,
      consensus_participation REAL,
      pulse_score REAL
    )
  `,

  /**
   * Peers table - tracks all known peers (reporting, gRPC, inferred)
   * Unified view of network participants including EXT nodes
   */
  peers: `
    CREATE TABLE IF NOT EXISTS peers (
      peer_id TEXT PRIMARY KEY,

      -- Source tracking
      source TEXT NOT NULL,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,

      -- Identity (for reporting nodes)
      node_name TEXT,
      client_version TEXT,

      -- Network info (from gRPC)
      ip_address TEXT,
      port INTEGER,

      -- Geolocation (from ip-api.com, cached)
      geo_country TEXT,
      geo_city TEXT,
      geo_lat REAL,
      geo_lon REAL,
      geo_isp TEXT,
      geo_updated INTEGER,

      -- Inference data
      seen_by_count INTEGER DEFAULT 0,
      is_bootstrapper INTEGER DEFAULT 0,

      -- gRPC-specific
      catchup_status TEXT,
      grpc_latency_ms INTEGER,
      packets_sent INTEGER,
      packets_received INTEGER
    )
  `,

  /**
   * Peer connections - tracks which reporting nodes see which peers
   * Used for inference engine and connectivity analysis
   */
  peer_connections: `
    CREATE TABLE IF NOT EXISTS peer_connections (
      reporter_id TEXT NOT NULL,
      peer_id TEXT NOT NULL,
      last_seen INTEGER NOT NULL,
      PRIMARY KEY (reporter_id, peer_id)
    )
  `,

  /**
   * Indexes for common queries
   */
  indexes: [
    'CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON snapshots(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_snapshots_node_timestamp ON snapshots(node_id, timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)',
    'CREATE INDEX IF NOT EXISTS idx_events_node ON events(node_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_node ON node_sessions(node_id)',
    'CREATE INDEX IF NOT EXISTS idx_network_snapshots_timestamp ON network_snapshots(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_peers_source ON peers(source)',
    'CREATE INDEX IF NOT EXISTS idx_peers_ip ON peers(ip_address)',
    'CREATE INDEX IF NOT EXISTS idx_peer_connections_peer ON peer_connections(peer_id)',
  ],
} as const;

/**
 * Event types for tracking
 */
export type EventType =
  | 'node_appeared'
  | 'node_disappeared'
  | 'node_restarted'
  | 'health_changed'
  | 'name_changed'
  | 'client_updated';

/**
 * Health status values
 */
export type HealthStatus = 'healthy' | 'lagging' | 'issue';

/**
 * Node record from database
 */
export interface NodeRecord {
  node_id: string;
  node_name: string | null;
  client: string | null;
  peer_type: string | null;
  first_seen: number;
  last_seen: number;
  is_active: number;
}

/**
 * Snapshot record from database
 */
export interface SnapshotRecord {
  id: number;
  timestamp: number;
  node_id: string;
  health_status: HealthStatus;
  peers_count: number | null;
  avg_ping: number | null;
  finalized_height: number | null;
  height_delta: number | null;
  bytes_in: number | null;
  bytes_out: number | null;
}

/**
 * Event record from database
 */
export interface EventRecord {
  id: number;
  timestamp: number;
  node_id: string | null;
  event_type: EventType;
  old_value: string | null;
  new_value: string | null;
  metadata: string | null;
}

/**
 * Network snapshot record from database
 */
export interface NetworkSnapshotRecord {
  id: number;
  timestamp: number;
  total_nodes: number;
  healthy_nodes: number;
  lagging_nodes: number;
  issue_nodes: number;
  avg_peers: number | null;
  avg_latency: number | null;
  max_finalization_lag: number | null;
  consensus_participation: number | null;
  pulse_score: number | null;
}

/**
 * Peer source types
 */
export type PeerSource = 'reporting' | 'grpc' | 'inferred';

/**
 * Catchup status from gRPC
 */
export type CatchupStatus = 'UPTODATE' | 'PENDING' | 'CATCHINGUP';

/**
 * Peer record from database
 */
export interface PeerRecord {
  peer_id: string;
  source: PeerSource;
  first_seen: number;
  last_seen: number;
  node_name: string | null;
  client_version: string | null;
  ip_address: string | null;
  port: number | null;
  geo_country: string | null;
  geo_city: string | null;
  geo_lat: number | null;
  geo_lon: number | null;
  geo_isp: string | null;
  geo_updated: number | null;
  seen_by_count: number;
  is_bootstrapper: number;
  catchup_status: CatchupStatus | null;
  grpc_latency_ms: number | null;
  packets_sent: number | null;
  packets_received: number | null;
}

/**
 * Peer connection record from database
 */
export interface PeerConnectionRecord {
  reporter_id: string;
  peer_id: string;
  last_seen: number;
}
