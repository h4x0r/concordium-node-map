import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { NodeTracker, type NodeSummary } from './NodeTracker';
import { createTestDb } from './test-helpers';

describe('NodeTracker', () => {
  let db: Client;
  let tracker: NodeTracker;

  // Helper to create mock node data
  function createMockNode(overrides: Partial<NodeSummary> = {}): NodeSummary {
    return {
      nodeId: 'test-node-1',
      nodeName: 'Test Node 1',
      peerType: 'Node',
      client: 'concordium-node/6.3.0',
      peersCount: 10,
      averagePing: 50,
      uptime: 3600000, // 1 hour
      finalizedBlockHeight: 1000000,
      bestBlockHeight: 1000000,
      consensusRunning: true,
      averageBytesPerSecondIn: 1000,
      averageBytesPerSecondOut: 500,
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = await createTestDb();
    tracker = new NodeTracker(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('processNodes', () => {
    it('detects and records a new node', async () => {
      const nodes = [createMockNode({ nodeId: 'new-node-1', nodeName: 'New Node' })];

      const result = await tracker.processNodes(nodes, 1000000);

      expect(result.newNodes).toHaveLength(1);
      expect(result.newNodes[0]).toBe('new-node-1');

      // Verify node was stored
      const stored = await db.execute('SELECT * FROM nodes WHERE node_id = ?', ['new-node-1']);
      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0].node_name).toBe('New Node');

      // Verify event was recorded
      const events = await db.execute(
        "SELECT * FROM events WHERE event_type = 'node_appeared' AND node_id = ?",
        ['new-node-1']
      );
      expect(events.rows).toHaveLength(1);
    });

    it('detects multiple new nodes', async () => {
      const nodes = [
        createMockNode({ nodeId: 'node-1', nodeName: 'Node 1' }),
        createMockNode({ nodeId: 'node-2', nodeName: 'Node 2' }),
        createMockNode({ nodeId: 'node-3', nodeName: 'Node 3' }),
      ];

      const result = await tracker.processNodes(nodes, 1000000);

      expect(result.newNodes).toHaveLength(3);
      expect(result.newNodes).toContain('node-1');
      expect(result.newNodes).toContain('node-2');
      expect(result.newNodes).toContain('node-3');
    });

    it('does not report existing nodes as new', async () => {
      const node = createMockNode({ nodeId: 'existing-node' });

      // First process - should be new
      const result1 = await tracker.processNodes([node], 1000000);
      expect(result1.newNodes).toHaveLength(1);

      // Second process - should not be new
      const result2 = await tracker.processNodes([node], 1000000);
      expect(result2.newNodes).toHaveLength(0);
    });

    it('detects node restart when uptime decreases', async () => {
      const node = createMockNode({ nodeId: 'restart-node', uptime: 7200000 }); // 2 hours

      // First process
      await tracker.processNodes([node], 1000000);

      // Simulate restart - uptime reset to 30 minutes
      const restartedNode = createMockNode({ nodeId: 'restart-node', uptime: 1800000 });
      const result = await tracker.processNodes([restartedNode], 1000000);

      expect(result.restarts).toHaveLength(1);
      expect(result.restarts[0]).toBe('restart-node');

      // Verify restart event was recorded
      const events = await db.execute(
        "SELECT * FROM events WHERE event_type = 'node_restarted' AND node_id = ?",
        ['restart-node']
      );
      expect(events.rows).toHaveLength(1);

      // Verify new session was created
      const sessions = await db.execute(
        'SELECT * FROM node_sessions WHERE node_id = ? ORDER BY id',
        ['restart-node']
      );
      expect(sessions.rows).toHaveLength(2);
      expect(sessions.rows[0].end_reason).toBe('restart_detected');
    });

    it('detects node disappearance', async () => {
      const node1 = createMockNode({ nodeId: 'node-1' });
      const node2 = createMockNode({ nodeId: 'node-2' });

      // First process with both nodes
      await tracker.processNodes([node1, node2], 1000000);

      // Second process - node-2 disappeared
      const result = await tracker.processNodes([node1], 1000000);

      expect(result.disappeared).toHaveLength(1);
      expect(result.disappeared[0]).toBe('node-2');

      // Verify node marked inactive
      const stored = await db.execute('SELECT is_active FROM nodes WHERE node_id = ?', ['node-2']);
      expect(stored.rows[0].is_active).toBe(0);

      // Verify event was recorded
      const events = await db.execute(
        "SELECT * FROM events WHERE event_type = 'node_disappeared' AND node_id = ?",
        ['node-2']
      );
      expect(events.rows).toHaveLength(1);
    });

    it('detects node reappearance', async () => {
      const node = createMockNode({ nodeId: 'flaky-node' });

      // Appear
      await tracker.processNodes([node], 1000000);
      // Disappear
      await tracker.processNodes([], 1000000);
      // Reappear
      const result = await tracker.processNodes([node], 1000000);

      expect(result.reappeared).toHaveLength(1);
      expect(result.reappeared[0]).toBe('flaky-node');

      // Verify node marked active again
      const stored = await db.execute('SELECT is_active FROM nodes WHERE node_id = ?', ['flaky-node']);
      expect(stored.rows[0].is_active).toBe(1);
    });

    it('records health snapshots', async () => {
      const node = createMockNode({
        nodeId: 'health-node',
        peersCount: 15,
        averagePing: 45,
        finalizedBlockHeight: 999998,
      });

      await tracker.processNodes([node], 1000000); // maxHeight = 1000000, so delta = 2

      const snapshots = await db.execute(
        'SELECT * FROM snapshots WHERE node_id = ?',
        ['health-node']
      );
      expect(snapshots.rows).toHaveLength(1);
      expect(snapshots.rows[0].peers_count).toBe(15);
      expect(snapshots.rows[0].avg_ping).toBe(45);
      expect(snapshots.rows[0].height_delta).toBe(2);
      expect(snapshots.rows[0].health_status).toBe('healthy'); // delta <= 2
    });

    it('calculates health status correctly', async () => {
      const healthyNode = createMockNode({ nodeId: 'healthy', finalizedBlockHeight: 1000000 });
      const laggingNode = createMockNode({ nodeId: 'lagging', finalizedBlockHeight: 999996 }); // 4 behind
      const issueNode = createMockNode({ nodeId: 'issue', finalizedBlockHeight: 999990 }); // 10 behind

      await tracker.processNodes([healthyNode, laggingNode, issueNode], 1000000);

      const snapshots = await db.execute('SELECT node_id, health_status FROM snapshots');
      const healthMap = Object.fromEntries(
        snapshots.rows.map((r) => [r.node_id, r.health_status])
      );

      expect(healthMap['healthy']).toBe('healthy');
      expect(healthMap['lagging']).toBe('lagging');
      expect(healthMap['issue']).toBe('issue');
    });

    it('detects health status changes', async () => {
      const node = createMockNode({ nodeId: 'changing-node', finalizedBlockHeight: 1000000 });

      // First: healthy
      await tracker.processNodes([node], 1000000);

      // Second: lagging (4 blocks behind)
      const laggingNode = createMockNode({ nodeId: 'changing-node', finalizedBlockHeight: 999996 });
      const result = await tracker.processNodes([laggingNode], 1000000);

      expect(result.healthChanges).toHaveLength(1);
      expect(result.healthChanges[0]).toEqual({
        nodeId: 'changing-node',
        from: 'healthy',
        to: 'lagging',
      });

      // Verify event was recorded
      const events = await db.execute(
        "SELECT * FROM events WHERE event_type = 'health_changed' AND node_id = ?",
        ['changing-node']
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].old_value).toBe('healthy');
      expect(events.rows[0].new_value).toBe('lagging');
    });

    it('detects client version changes', async () => {
      const node = createMockNode({ nodeId: 'updating-node', client: '9.0.6' });

      // First: version 9.0.6
      await tracker.processNodes([node], 1000000);

      // Second: upgraded to 9.0.7
      const upgradedNode = createMockNode({ nodeId: 'updating-node', client: '9.0.7' });
      const result = await tracker.processNodes([upgradedNode], 1000000);

      expect(result.versionChanges).toHaveLength(1);
      expect(result.versionChanges[0]).toEqual({
        nodeId: 'updating-node',
        from: '9.0.6',
        to: '9.0.7',
      });

      // Verify client was updated in nodes table
      const stored = await db.execute('SELECT client FROM nodes WHERE node_id = ?', ['updating-node']);
      expect(stored.rows[0].client).toBe('9.0.7');

      // Verify event was recorded
      const events = await db.execute(
        "SELECT * FROM events WHERE event_type = 'client_updated' AND node_id = ?",
        ['updating-node']
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].old_value).toBe('9.0.6');
      expect(events.rows[0].new_value).toBe('9.0.7');
    });
  });

  describe('getNewNodesInRange', () => {
    it('returns nodes that appeared in time range', async () => {
      const now = Date.now();

      // Process nodes at different times
      const node1 = createMockNode({ nodeId: 'old-node' });
      const node2 = createMockNode({ nodeId: 'new-node' });

      // Simulate old node (appeared 2 hours ago)
      await db.execute(
        'INSERT INTO nodes (node_id, node_name, first_seen, last_seen, is_active) VALUES (?, ?, ?, ?, 1)',
        ['old-node', 'Old Node', now - 7200000, now]
      );
      await db.execute(
        "INSERT INTO events (timestamp, node_id, event_type) VALUES (?, ?, 'node_appeared')",
        [now - 7200000, 'old-node']
      );

      // Simulate new node (appeared 30 minutes ago)
      await db.execute(
        'INSERT INTO nodes (node_id, node_name, first_seen, last_seen, is_active) VALUES (?, ?, ?, ?, 1)',
        ['new-node', 'New Node', now - 1800000, now]
      );
      await db.execute(
        "INSERT INTO events (timestamp, node_id, event_type) VALUES (?, ?, 'node_appeared')",
        [now - 1800000, 'new-node']
      );

      // Query for last hour
      const newNodes = await tracker.getNewNodesInRange(now - 3600000, now);

      expect(newNodes).toHaveLength(1);
      expect(newNodes[0].node_id).toBe('new-node');
    });
  });

  describe('getNodeHealthHistory', () => {
    it('returns health snapshots for a node', async () => {
      const now = Date.now();
      const node = createMockNode({ nodeId: 'history-node' });

      // Insert multiple snapshots
      await tracker.processNodes([node], 1000000);

      // Simulate more snapshots over time
      for (let i = 1; i <= 5; i++) {
        await db.execute(
          `INSERT INTO snapshots (timestamp, node_id, health_status, peers_count, height_delta)
           VALUES (?, ?, ?, ?, ?)`,
          [now + i * 60000, 'history-node', 'healthy', 10 + i, 0]
        );
      }

      const history = await tracker.getNodeHealthHistory('history-node', now - 60000, now + 360000);

      expect(history.length).toBeGreaterThanOrEqual(5);
      expect(history.every((h) => h.node_id === 'history-node')).toBe(true);
    });
  });
});
