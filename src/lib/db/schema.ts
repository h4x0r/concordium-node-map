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
      is_active INTEGER DEFAULT 1,
      -- Validator linkage (from dashboard API consensusBakerId)
      consensus_baker_id INTEGER,
      baking_committee_member TEXT
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
      packets_received INTEGER,

      -- Validator linkage (baker ID if this peer is a validator)
      consensus_baker_id INTEGER
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
   * Shodan scans - cached results from bulk port:20000 search
   * Refreshed weekly via cron, 30-day TTL
   */
  shodan_scans: `
    CREATE TABLE IF NOT EXISTS shodan_scans (
      ip TEXT PRIMARY KEY,
      ports TEXT,
      hostnames TEXT,
      org TEXT,
      isp TEXT,
      asn TEXT,
      country_code TEXT,
      city TEXT,
      vulns TEXT,
      product TEXT,
      os TEXT,
      last_updated INTEGER,
      cached_at INTEGER NOT NULL
    )
  `,

  /**
   * OSINT cache - InternetDB responses for hover cards
   * 24-hour TTL, free unlimited lookups
   */
  osint_cache: `
    CREATE TABLE IF NOT EXISTS osint_cache (
      ip TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      ports TEXT,
      hostnames TEXT,
      tags TEXT,
      vulns TEXT,
      cpes TEXT,
      fetched_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `,

  /**
   * Validators table - ALL registered bakers from chain
   * Includes both reporting (visible) and phantom validators
   */
  validators: `
    CREATE TABLE IF NOT EXISTS validators (
      baker_id INTEGER PRIMARY KEY,

      -- Chain identity (authoritative)
      account_address TEXT NOT NULL,

      -- Visibility status
      source TEXT NOT NULL,              -- 'reporting' | 'chain_only' (phantom)
      linked_peer_id TEXT,               -- FK to peers.peer_id if reporting

      -- Stake data (from getPoolStatus) - stored as TEXT for bigint
      equity_capital TEXT,
      delegated_capital TEXT,
      total_stake TEXT,
      lottery_power REAL,                -- 0.0 to 1.0

      -- Pool config
      open_status TEXT,                  -- 'openForAll' | 'closedForNew' | 'closedForAll'
      commission_baking REAL,
      commission_finalization REAL,
      commission_transaction REAL,

      -- Payday status
      in_current_payday INTEGER DEFAULT 0,
      effective_stake TEXT,

      -- Block production evidence
      last_block_height INTEGER,
      last_block_time INTEGER,
      blocks_24h INTEGER DEFAULT 0,
      blocks_7d INTEGER DEFAULT 0,

      -- Forensic tracking
      first_observed INTEGER NOT NULL,
      last_chain_update INTEGER,
      state_transition_count INTEGER DEFAULT 0,

      -- Computed fields
      data_completeness REAL
      -- Note: linked_peer_id is NOT a foreign key because validators from chain
      -- may reference peers that don't exist in our database yet
    )
  `,

  /**
   * Validator state transitions - forensic audit trail
   * Tracks phantom→visible, stake changes, suspension events
   */
  validator_transitions: `
    CREATE TABLE IF NOT EXISTS validator_transitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      baker_id INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      transition_type TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      evidence TEXT,

      FOREIGN KEY (baker_id) REFERENCES validators(baker_id)
    )
  `,

  /**
   * Consensus snapshots - periodic visibility metrics
   * For tracking consensus health over time
   */
  consensus_snapshots: `
    CREATE TABLE IF NOT EXISTS consensus_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,

      -- Validator counts
      total_registered INTEGER NOT NULL,
      visible_reporting INTEGER NOT NULL,
      phantom_chain_only INTEGER NOT NULL,
      validator_coverage_pct REAL,

      -- Stake metrics (stored as TEXT for bigint)
      total_network_stake TEXT,
      visible_stake TEXT,
      phantom_stake TEXT,
      stake_visibility_pct REAL,

      -- Lottery power
      visible_lottery_power REAL,
      phantom_lottery_power REAL,

      -- Block production (last period)
      blocks_by_visible INTEGER,
      blocks_by_phantom INTEGER,
      block_visibility_pct REAL,

      -- Health indicators
      quorum_health TEXT,
      phantom_block_alert INTEGER DEFAULT 0
    )
  `,

  /**
   * Blocks table - tracks block production for forensic analysis
   * Records which baker produced each block
   */
  blocks: `
    CREATE TABLE IF NOT EXISTS blocks (
      height INTEGER PRIMARY KEY,
      hash TEXT NOT NULL UNIQUE,
      baker_id INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      recorded_at INTEGER NOT NULL
    )
  `,

  /**
   * Consensus alerts table - tracks alerts for forensic audit trail
   * Records alerts about phantom blocks, stake visibility, quorum health
   */
  consensus_alerts: `
    CREATE TABLE IF NOT EXISTS consensus_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT,
      acknowledged INTEGER DEFAULT 0,
      acknowledged_at INTEGER,
      acknowledged_by TEXT
    )
  `,

  /**
   * Quorum health history - tracks quorum health changes for transition detection
   */
  quorum_health_history: `
    CREATE TABLE IF NOT EXISTS quorum_health_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      health TEXT NOT NULL
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
    'CREATE INDEX IF NOT EXISTS idx_shodan_scans_cached ON shodan_scans(cached_at)',
    'CREATE INDEX IF NOT EXISTS idx_osint_cache_expires ON osint_cache(expires_at)',
    'CREATE INDEX IF NOT EXISTS idx_validators_source ON validators(source)',
    'CREATE INDEX IF NOT EXISTS idx_validators_lottery ON validators(lottery_power)',
    'CREATE INDEX IF NOT EXISTS idx_validator_transitions_baker ON validator_transitions(baker_id)',
    'CREATE INDEX IF NOT EXISTS idx_validator_transitions_type ON validator_transitions(transition_type)',
    'CREATE INDEX IF NOT EXISTS idx_consensus_snapshots_timestamp ON consensus_snapshots(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_blocks_baker ON blocks(baker_id)',
    'CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_consensus_alerts_type ON consensus_alerts(alert_type)',
    'CREATE INDEX IF NOT EXISTS idx_consensus_alerts_timestamp ON consensus_alerts(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_quorum_health_history_timestamp ON quorum_health_history(timestamp)',
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
  consensus_baker_id: number | null;
  baking_committee_member: string | null;
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

/**
 * Shodan scan record from database
 */
export interface ShodanScanRecord {
  ip: string;
  ports: string | null;       // JSON array
  hostnames: string | null;   // JSON array
  org: string | null;
  isp: string | null;
  asn: string | null;
  country_code: string | null;
  city: string | null;
  vulns: string | null;       // JSON array
  product: string | null;
  os: string | null;
  last_updated: number | null;
  cached_at: number;
}

/**
 * OSINT cache record from database
 */
export interface OsintCacheRecord {
  ip: string;
  source: 'internetdb' | 'shodan';
  ports: string | null;       // JSON array
  hostnames: string | null;   // JSON array
  tags: string | null;        // JSON array
  vulns: string | null;       // JSON array
  cpes: string | null;        // JSON array
  fetched_at: number;
  expires_at: number;
}

/**
 * Validator source types
 */
export type ValidatorSource = 'reporting' | 'chain_only';

/**
 * Validator transition types
 */
export type ValidatorTransitionType =
  | 'phantom_to_visible'
  | 'visible_to_phantom'
  | 'stake_changed'
  | 'suspended'
  | 'reactivated'
  | 'delegation_changed'
  | 'commission_changed';

/**
 * Quorum health status
 */
export type QuorumHealth = 'healthy' | 'degraded' | 'critical';

/**
 * Validator record from database
 */
export interface ValidatorRecord {
  baker_id: number;
  account_address: string;
  source: ValidatorSource;
  linked_peer_id: string | null;
  equity_capital: string | null;
  delegated_capital: string | null;
  total_stake: string | null;
  lottery_power: number | null;
  open_status: string | null;
  commission_baking: number | null;
  commission_finalization: number | null;
  commission_transaction: number | null;
  in_current_payday: number;
  effective_stake: string | null;
  last_block_height: number | null;
  last_block_time: number | null;
  blocks_24h: number;
  blocks_7d: number;
  first_observed: number;
  last_chain_update: number | null;
  state_transition_count: number;
  data_completeness: number | null;
}

/**
 * Validator transition record from database
 */
export interface ValidatorTransitionRecord {
  id: number;
  baker_id: number;
  timestamp: number;
  transition_type: ValidatorTransitionType;
  old_value: string | null;
  new_value: string | null;
  evidence: string | null;
}

/**
 * Consensus snapshot record from database
 */
export interface ConsensusSnapshotRecord {
  id: number;
  timestamp: number;
  total_registered: number;
  visible_reporting: number;
  phantom_chain_only: number;
  validator_coverage_pct: number | null;
  total_network_stake: string | null;
  visible_stake: string | null;
  phantom_stake: string | null;
  stake_visibility_pct: number | null;
  visible_lottery_power: number | null;
  phantom_lottery_power: number | null;
  blocks_by_visible: number | null;
  blocks_by_phantom: number | null;
  block_visibility_pct: number | null;
  quorum_health: QuorumHealth | null;
  phantom_block_alert: number;
}
