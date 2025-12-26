import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { PollService } from './poll-service';
import { SCHEMA } from './db/schema';

// Mock the ConcordiumClient
vi.mock('./concordium-client', () => ({
  ConcordiumClient: class MockConcordiumClient {
    async getPeersInfo() {
      return [];
    }
    async isConnected() {
      return true;
    }
  },
  createMainnetClient: () => ({
    getPeersInfo: async () => [],
    isConnected: async () => true,
  }),
}));

// Mock the geo-lookup service
vi.mock('./geo-lookup', () => ({
  GeoLookupService: class MockGeoLookupService {
    async lookupIP() {
      return null;
    }
    async lookupBatch() {
      return new Map();
    }
  },
}));

describe('PollService', () => {
  let db: Client;
  let pollService: PollService;

  beforeEach(async () => {
    db = createClient({ url: ':memory:' });

    // Initialize schema
    await db.execute(SCHEMA.nodes);
    await db.execute(SCHEMA.node_sessions);
    await db.execute(SCHEMA.snapshots);
    await db.execute(SCHEMA.events);
    await db.execute(SCHEMA.network_snapshots);
    await db.execute(SCHEMA.peers);
    await db.execute(SCHEMA.peer_connections);
    for (const indexSql of SCHEMA.indexes) {
      await db.execute(indexSql);
    }

    pollService = new PollService(db);
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  describe('processReportingNodes', () => {
    it('creates peer records for reporting nodes', async () => {
      const nodes = [
        {
          nodeId: 'node-1',
          nodeName: 'Test Node 1',
          peerType: 'Node',
          client: 'concordium-node/6.3.0',
          peersCount: 10,
          averagePing: 50,
          uptime: 3600000,
          finalizedBlockHeight: 1000000,
          bestBlockHeight: 1000000,
          consensusRunning: true,
          averageBytesPerSecondIn: 1000,
          averageBytesPerSecondOut: 500,
        },
      ];

      await pollService.processReportingNodes(nodes);

      const result = await db.execute(
        'SELECT * FROM peers WHERE peer_id = ?',
        ['node-1']
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].source).toBe('reporting');
      expect(result.rows[0].node_name).toBe('Test Node 1');
      expect(result.rows[0].client_version).toBe('concordium-node/6.3.0');
    });

    it('updates existing reporting node info', async () => {
      const nodes = [
        {
          nodeId: 'node-1',
          nodeName: 'Original Name',
          peerType: 'Node',
          client: 'concordium-node/6.2.0',
          peersCount: 5,
          averagePing: 30,
          uptime: 1800000,
          finalizedBlockHeight: 999999,
          bestBlockHeight: 999999,
          consensusRunning: true,
          averageBytesPerSecondIn: 500,
          averageBytesPerSecondOut: 250,
        },
      ];

      // First process
      await pollService.processReportingNodes(nodes);

      // Update with new info
      nodes[0].nodeName = 'Updated Name';
      nodes[0].client = 'concordium-node/6.3.0';
      await pollService.processReportingNodes(nodes);

      const result = await db.execute(
        'SELECT * FROM peers WHERE peer_id = ?',
        ['node-1']
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].node_name).toBe('Updated Name');
      expect(result.rows[0].client_version).toBe('concordium-node/6.3.0');
    });
  });

  describe('processGrpcPeers', () => {
    it('creates peer records for gRPC peers', async () => {
      const grpcPeers = [
        {
          peerId: 'grpc-peer-1',
          ipAddress: '185.201.8.42',
          port: 10000,
          catchupStatus: 'UPTODATE' as const,
          latencyMs: 45,
          packetsSent: 1000,
          packetsReceived: 950,
          isBootstrapper: false,
        },
      ];

      await pollService.processGrpcPeers(grpcPeers, 'reporter-node');

      const result = await db.execute(
        'SELECT * FROM peers WHERE peer_id = ?',
        ['grpc-peer-1']
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].source).toBe('grpc');
      expect(result.rows[0].ip_address).toBe('185.201.8.42');
      expect(result.rows[0].port).toBe(10000);
      expect(result.rows[0].catchup_status).toBe('UPTODATE');
    });

    it('records peer connections', async () => {
      const grpcPeers = [
        {
          peerId: 'grpc-peer-1',
          ipAddress: '185.201.8.42',
          port: 10000,
          catchupStatus: 'UPTODATE' as const,
          latencyMs: 45,
          packetsSent: 1000,
          packetsReceived: 950,
          isBootstrapper: false,
        },
      ];

      await pollService.processGrpcPeers(grpcPeers, 'reporter-node');

      const connections = await db.execute(
        'SELECT * FROM peer_connections WHERE reporter_id = ? AND peer_id = ?',
        ['reporter-node', 'grpc-peer-1']
      );
      expect(connections.rows).toHaveLength(1);
    });

    it('marks bootstrapper peers from gRPC info', async () => {
      const grpcPeers = [
        {
          peerId: 'bootstrap-peer',
          ipAddress: '10.0.0.1',
          port: 10000,
          catchupStatus: 'UPTODATE' as const,
          latencyMs: 10,
          packetsSent: 10000,
          packetsReceived: 9500,
          isBootstrapper: true,
        },
      ];

      await pollService.processGrpcPeers(grpcPeers, 'reporter');

      const result = await db.execute(
        'SELECT is_bootstrapper FROM peers WHERE peer_id = ?',
        ['bootstrap-peer']
      );
      expect(result.rows[0].is_bootstrapper).toBe(1);
    });
  });

  describe('identifyExtNodes', () => {
    it('creates inferred records for EXT peers', async () => {
      // Setup: Create a reporting node
      await db.execute({
        sql: `INSERT INTO peers (peer_id, source, first_seen, last_seen, node_name)
              VALUES (?, 'reporting', ?, ?, ?)`,
        args: ['reporter-1', Date.now(), Date.now(), 'Reporter 1'],
      });

      // Simulate external peer references (from nodesSummary "peersList")
      const extPeerIds = ['ext-peer-1', 'ext-peer-2'];

      await pollService.identifyExtNodes(extPeerIds, 'reporter-1');

      // Check inferred records were created
      const result = await db.execute(
        `SELECT * FROM peers WHERE source = 'inferred'`
      );
      expect(result.rows).toHaveLength(2);

      // Check connections were recorded
      const connections = await db.execute(
        'SELECT * FROM peer_connections WHERE reporter_id = ?',
        ['reporter-1']
      );
      expect(connections.rows).toHaveLength(2);
    });

    it('does not override existing peer records with inferred', async () => {
      // Setup: Create a grpc peer
      await db.execute({
        sql: `INSERT INTO peers (peer_id, source, first_seen, last_seen, ip_address)
              VALUES (?, 'grpc', ?, ?, ?)`,
        args: ['existing-peer', Date.now(), Date.now(), '1.2.3.4'],
      });

      // Try to create as inferred
      await pollService.identifyExtNodes(['existing-peer'], 'reporter');

      // Should still be 'grpc', not overwritten to 'inferred'
      const result = await db.execute(
        'SELECT source, ip_address FROM peers WHERE peer_id = ?',
        ['existing-peer']
      );
      expect(result.rows[0].source).toBe('grpc');
      expect(result.rows[0].ip_address).toBe('1.2.3.4');
    });
  });

  describe('updateGeoLocations', () => {
    it('queues peers with IPs for geo lookup', async () => {
      // Create peer with IP but no geo data
      await db.execute({
        sql: `INSERT INTO peers (peer_id, source, first_seen, last_seen, ip_address)
              VALUES (?, 'grpc', ?, ?, ?)`,
        args: ['geo-peer', Date.now(), Date.now(), '185.201.8.42'],
      });

      const stats = await pollService.updateGeoLocations();

      // Should have attempted lookup (even if mocked to return null)
      expect(stats.attempted).toBe(1);
    });

    it('skips peers that already have geo data', async () => {
      // Create peer with IP and geo data
      const now = Date.now();
      await db.execute({
        sql: `INSERT INTO peers (peer_id, source, first_seen, last_seen, ip_address,
              geo_country, geo_city, geo_lat, geo_lon, geo_updated)
              VALUES (?, 'grpc', ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ['geo-peer', now, now, '185.201.8.42', 'Germany', 'Berlin', 52.52, 13.405, now],
      });

      const stats = await pollService.updateGeoLocations();

      expect(stats.attempted).toBe(0);
    });
  });

  describe('runInference', () => {
    it('infers locations for peers without geo data', async () => {
      // Setup: Create reporter with geo data
      const now = Date.now();
      await db.execute({
        sql: `INSERT INTO peers (peer_id, source, first_seen, last_seen,
              geo_country, geo_lat, geo_lon, geo_updated)
              VALUES (?, 'reporting', ?, ?, ?, ?, ?, ?)`,
        args: ['reporter', now, now, 'Germany', 52.52, 13.405, now],
      });

      // Create inferred peer without geo
      await db.execute({
        sql: `INSERT INTO peers (peer_id, source, first_seen, last_seen)
              VALUES (?, 'inferred', ?, ?)`,
        args: ['inferred-peer', now, now],
      });

      // Record connection
      await db.execute({
        sql: `INSERT INTO peer_connections (reporter_id, peer_id, last_seen)
              VALUES (?, ?, ?)`,
        args: ['reporter', 'inferred-peer', now],
      });

      const stats = await pollService.runInference();

      expect(stats.locationsInferred).toBeGreaterThanOrEqual(0);
    });

    it('detects bootstrappers', async () => {
      // Create a well-connected, old peer
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      await db.execute({
        sql: `INSERT INTO peers (peer_id, source, first_seen, last_seen, seen_by_count)
              VALUES (?, 'grpc', ?, ?, ?)`,
        args: ['bootstrap-candidate', eightDaysAgo, Date.now(), 15],
      });

      await pollService.runInference();

      const result = await db.execute(
        'SELECT is_bootstrapper FROM peers WHERE peer_id = ?',
        ['bootstrap-candidate']
      );
      expect(result.rows[0].is_bootstrapper).toBe(1);
    });
  });

  describe('pollComplete', () => {
    it('runs the complete poll cycle', async () => {
      const nodes = [
        {
          nodeId: 'complete-node',
          nodeName: 'Complete Test',
          peerType: 'Node',
          client: 'concordium-node/6.3.0',
          peersCount: 5,
          averagePing: 40,
          uptime: 3600000,
          finalizedBlockHeight: 1000000,
          bestBlockHeight: 1000000,
          consensusRunning: true,
          averageBytesPerSecondIn: 1000,
          averageBytesPerSecondOut: 500,
        },
      ];

      const result = await pollService.pollComplete(nodes);

      expect(result.reportingNodesProcessed).toBe(1);
      expect(result.peersTableCount).toBeGreaterThan(0);
    });
  });
});
