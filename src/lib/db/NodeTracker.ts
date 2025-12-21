import type { Client } from '@libsql/client';
import type { HealthStatus, NodeRecord, SnapshotRecord, EventType } from './schema';

/**
 * Node summary from the Concordium dashboard API
 */
export interface NodeSummary {
  nodeId: string;
  nodeName: string;
  peerType: string;
  client: string;
  peersCount: number;
  averagePing: number | null;
  uptime: number;
  finalizedBlockHeight: number;
  bestBlockHeight: number;
  consensusRunning: boolean;
  averageBytesPerSecondIn: number | null;
  averageBytesPerSecondOut: number | null;
}

/**
 * Result of processing nodes
 */
export interface ProcessResult {
  newNodes: string[];
  disappeared: string[];
  reappeared: string[];
  restarts: string[];
  healthChanges: Array<{
    nodeId: string;
    from: HealthStatus;
    to: HealthStatus;
  }>;
  snapshotsRecorded: number;
}

/**
 * NodeTracker - tracks node state changes and health over time
 */
export class NodeTracker {
  private db: Client;
  private lastUptimes: Map<string, number> = new Map();
  private lastHealthStatus: Map<string, HealthStatus> = new Map();

  constructor(db: Client) {
    this.db = db;
  }

  /**
   * Calculate health status based on finalization lag
   */
  private calculateHealthStatus(heightDelta: number, consensusRunning: boolean): HealthStatus {
    if (!consensusRunning) return 'issue';
    if (heightDelta <= 2) return 'healthy';
    if (heightDelta <= 5) return 'lagging';
    return 'issue';
  }

  /**
   * Record an event
   */
  private async recordEvent(
    timestamp: number,
    nodeId: string | null,
    eventType: EventType,
    oldValue: string | null = null,
    newValue: string | null = null,
    metadata: string | null = null
  ): Promise<void> {
    await this.db.execute(
      `INSERT INTO events (timestamp, node_id, event_type, old_value, new_value, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [timestamp, nodeId, eventType, oldValue, newValue, metadata]
    );
  }

  /**
   * Process a batch of nodes from the API
   * Detects new nodes, disappearances, restarts, and health changes
   */
  async processNodes(nodes: NodeSummary[], maxHeight: number): Promise<ProcessResult> {
    const now = Date.now();
    const result: ProcessResult = {
      newNodes: [],
      disappeared: [],
      reappeared: [],
      restarts: [],
      healthChanges: [],
      snapshotsRecorded: 0,
    };

    // Get current known nodes
    const knownNodesResult = await this.db.execute('SELECT node_id, is_active FROM nodes');
    const knownNodes = new Map<string, boolean>();
    for (const row of knownNodesResult.rows) {
      knownNodes.set(row.node_id as string, row.is_active === 1);
    }

    // Track which nodes we've seen in this batch
    const seenNodeIds = new Set<string>();

    for (const node of nodes) {
      seenNodeIds.add(node.nodeId);
      const heightDelta = maxHeight - node.finalizedBlockHeight;
      const healthStatus = this.calculateHealthStatus(heightDelta, node.consensusRunning);

      if (!knownNodes.has(node.nodeId)) {
        // New node
        result.newNodes.push(node.nodeId);

        await this.db.execute(
          `INSERT INTO nodes (node_id, node_name, client, peer_type, first_seen, last_seen, is_active)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [node.nodeId, node.nodeName, node.client, node.peerType, now, now]
        );

        await this.recordEvent(now, node.nodeId, 'node_appeared', null, node.nodeName);

        // Create initial session
        const sessionStart = now - node.uptime;
        await this.db.execute(
          `INSERT INTO node_sessions (node_id, start_time) VALUES (?, ?)`,
          [node.nodeId, sessionStart]
        );
      } else {
        // Existing node
        const wasActive = knownNodes.get(node.nodeId);

        if (!wasActive) {
          // Node reappeared
          result.reappeared.push(node.nodeId);

          await this.db.execute(
            `UPDATE nodes SET is_active = 1, last_seen = ? WHERE node_id = ?`,
            [now, node.nodeId]
          );

          await this.recordEvent(now, node.nodeId, 'node_appeared', null, 'reappeared');

          // Create new session
          const sessionStart = now - node.uptime;
          await this.db.execute(
            `INSERT INTO node_sessions (node_id, start_time) VALUES (?, ?)`,
            [node.nodeId, sessionStart]
          );
        } else {
          // Update last_seen
          await this.db.execute(
            `UPDATE nodes SET last_seen = ? WHERE node_id = ?`,
            [now, node.nodeId]
          );

          // Check for restart (uptime decreased)
          const lastUptime = this.lastUptimes.get(node.nodeId);
          if (lastUptime !== undefined && node.uptime < lastUptime) {
            result.restarts.push(node.nodeId);

            // Close previous session
            await this.db.execute(
              `UPDATE node_sessions
               SET end_time = ?, end_reason = 'restart_detected'
               WHERE node_id = ? AND end_time IS NULL`,
              [now, node.nodeId]
            );

            // Create new session
            const sessionStart = now - node.uptime;
            await this.db.execute(
              `INSERT INTO node_sessions (node_id, start_time) VALUES (?, ?)`,
              [node.nodeId, sessionStart]
            );

            await this.recordEvent(
              now,
              node.nodeId,
              'node_restarted',
              String(lastUptime),
              String(node.uptime)
            );
          }

          // Check for health status change
          const lastHealth = this.lastHealthStatus.get(node.nodeId);
          if (lastHealth !== undefined && lastHealth !== healthStatus) {
            result.healthChanges.push({
              nodeId: node.nodeId,
              from: lastHealth,
              to: healthStatus,
            });

            await this.recordEvent(now, node.nodeId, 'health_changed', lastHealth, healthStatus);
          }
        }
      }

      // Update tracking maps
      this.lastUptimes.set(node.nodeId, node.uptime);
      this.lastHealthStatus.set(node.nodeId, healthStatus);

      // Record snapshot
      await this.db.execute(
        `INSERT INTO snapshots (timestamp, node_id, health_status, peers_count, avg_ping,
         finalized_height, height_delta, bytes_in, bytes_out)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          now,
          node.nodeId,
          healthStatus,
          node.peersCount,
          node.averagePing,
          node.finalizedBlockHeight,
          heightDelta,
          node.averageBytesPerSecondIn,
          node.averageBytesPerSecondOut,
        ]
      );
      result.snapshotsRecorded++;
    }

    // Detect disappeared nodes
    for (const [nodeId, isActive] of knownNodes) {
      if (isActive && !seenNodeIds.has(nodeId)) {
        result.disappeared.push(nodeId);

        await this.db.execute(
          `UPDATE nodes SET is_active = 0, last_seen = ? WHERE node_id = ?`,
          [now, nodeId]
        );

        // Close session
        await this.db.execute(
          `UPDATE node_sessions
           SET end_time = ?, end_reason = 'disappeared'
           WHERE node_id = ? AND end_time IS NULL`,
          [now, nodeId]
        );

        await this.recordEvent(now, nodeId, 'node_disappeared');
      }
    }

    return result;
  }

  /**
   * Get nodes that appeared in a time range
   */
  async getNewNodesInRange(startTime: number, endTime: number): Promise<NodeRecord[]> {
    const result = await this.db.execute(
      `SELECT n.* FROM nodes n
       INNER JOIN events e ON n.node_id = e.node_id
       WHERE e.event_type = 'node_appeared'
         AND e.timestamp >= ? AND e.timestamp <= ?
         AND (e.new_value IS NULL OR e.new_value != 'reappeared')
       ORDER BY e.timestamp DESC`,
      [startTime, endTime]
    );

    return result.rows as unknown as NodeRecord[];
  }

  /**
   * Get health history for a specific node
   */
  async getNodeHealthHistory(
    nodeId: string,
    startTime: number,
    endTime: number
  ): Promise<SnapshotRecord[]> {
    const result = await this.db.execute(
      `SELECT * FROM snapshots
       WHERE node_id = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`,
      [nodeId, startTime, endTime]
    );

    return result.rows as unknown as SnapshotRecord[];
  }
}
