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
   * Indexes for common queries
   */
  indexes: [
    'CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON snapshots(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_snapshots_node_timestamp ON snapshots(node_id, timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)',
    'CREATE INDEX IF NOT EXISTS idx_events_node ON events(node_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_node ON node_sessions(node_id)',
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
