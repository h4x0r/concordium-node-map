import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { PeerTracker, type PeerRecord, type PeerSource } from './PeerTracker';
import { SCHEMA } from './schema';

describe('PeerTracker', () => {
  let db: Client;
  let tracker: PeerTracker;

  beforeEach(async () => {
    // Create in-memory database for testing
    db = createClient({ url: ':memory:' });

    // Initialize all schema including new peer tables
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

    tracker = new PeerTracker(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('upsertPeer', () => {
    it('inserts new peer with reporting source', async () => {
      const now = Date.now();
      await tracker.upsertPeer({
        peerId: 'abc123def456',
        source: 'reporting',
        nodeName: 'Test Node',
        clientVersion: 'concordium-node/6.3.0',
      });

      const peer = await tracker.getPeer('abc123def456');
      expect(peer).not.toBeNull();
      expect(peer!.peer_id).toBe('abc123def456');
      expect(peer!.source).toBe('reporting');
      expect(peer!.node_name).toBe('Test Node');
      expect(peer!.client_version).toBe('concordium-node/6.3.0');
      expect(peer!.first_seen).toBeGreaterThanOrEqual(now - 1000);
      expect(peer!.last_seen).toBeGreaterThanOrEqual(now - 1000);
    });

    it('inserts peer with gRPC source and IP', async () => {
      await tracker.upsertPeer({
        peerId: 'grpc123peer',
        source: 'grpc',
        ipAddress: '185.201.8.42',
        port: 10000,
        catchupStatus: 'UPTODATE',
        grpcLatencyMs: 45,
      });

      const peer = await tracker.getPeer('grpc123peer');
      expect(peer).not.toBeNull();
      expect(peer!.source).toBe('grpc');
      expect(peer!.ip_address).toBe('185.201.8.42');
      expect(peer!.port).toBe(10000);
      expect(peer!.catchup_status).toBe('UPTODATE');
      expect(peer!.grpc_latency_ms).toBe(45);
    });

    it('inserts peer with inferred source', async () => {
      await tracker.upsertPeer({
        peerId: 'inferred123',
        source: 'inferred',
      });

      const peer = await tracker.getPeer('inferred123');
      expect(peer).not.toBeNull();
      expect(peer!.source).toBe('inferred');
      expect(peer!.node_name).toBeNull();
    });

    it('updates existing peer and preserves first_seen', async () => {
      const initialTime = Date.now() - 10000;

      // Insert initial peer
      await db.execute({
        sql: `INSERT INTO peers (peer_id, source, first_seen, last_seen) VALUES (?, ?, ?, ?)`,
        args: ['existing123', 'inferred', initialTime, initialTime],
      });

      // Update with more data
      await tracker.upsertPeer({
        peerId: 'existing123',
        source: 'grpc',
        ipAddress: '8.8.8.8',
      });

      const peer = await tracker.getPeer('existing123');
      expect(peer!.first_seen).toBe(initialTime); // preserved
      expect(peer!.last_seen).toBeGreaterThan(initialTime); // updated
      expect(peer!.source).toBe('grpc'); // upgraded
      expect(peer!.ip_address).toBe('8.8.8.8');
    });
  });

  describe('updateGeoData', () => {
    it('updates geo information for a peer', async () => {
      await tracker.upsertPeer({
        peerId: 'geo123',
        source: 'grpc',
        ipAddress: '185.201.8.42',
      });

      await tracker.updateGeoData('geo123', {
        country: 'Germany',
        city: 'Frankfurt',
        lat: 50.1109,
        lon: 8.6821,
        isp: 'Hetzner Online GmbH',
      });

      const peer = await tracker.getPeer('geo123');
      expect(peer!.geo_country).toBe('Germany');
      expect(peer!.geo_city).toBe('Frankfurt');
      expect(peer!.geo_lat).toBe(50.1109);
      expect(peer!.geo_lon).toBe(8.6821);
      expect(peer!.geo_isp).toBe('Hetzner Online GmbH');
      expect(peer!.geo_updated).toBeGreaterThan(0);
    });
  });

  describe('recordConnection', () => {
    it('records a peer connection', async () => {
      await tracker.recordConnection('reporter123', 'peer456');

      const connections = await tracker.getConnectionsForPeer('peer456');
      expect(connections).toHaveLength(1);
      expect(connections[0].reporter_id).toBe('reporter123');
    });

    it('updates last_seen on duplicate connection', async () => {
      const initialTime = Date.now() - 10000;

      await db.execute({
        sql: `INSERT INTO peer_connections (reporter_id, peer_id, last_seen) VALUES (?, ?, ?)`,
        args: ['reporter123', 'peer456', initialTime],
      });

      await tracker.recordConnection('reporter123', 'peer456');

      const result = await db.execute({
        sql: `SELECT last_seen FROM peer_connections WHERE reporter_id = ? AND peer_id = ?`,
        args: ['reporter123', 'peer456'],
      });

      expect(Number(result.rows[0].last_seen)).toBeGreaterThan(initialTime);
    });
  });

  describe('getSeenByCount', () => {
    it('returns count of reporters seeing a peer', async () => {
      await tracker.recordConnection('reporter1', 'ext_peer');
      await tracker.recordConnection('reporter2', 'ext_peer');
      await tracker.recordConnection('reporter3', 'ext_peer');

      const count = await tracker.getSeenByCount('ext_peer');
      expect(count).toBe(3);
    });

    it('returns 0 for unknown peer', async () => {
      const count = await tracker.getSeenByCount('unknown123');
      expect(count).toBe(0);
    });
  });

  describe('getPeersNeedingGeoLookup', () => {
    it('returns peers with IP but no geo data', async () => {
      await tracker.upsertPeer({
        peerId: 'has_ip_no_geo',
        source: 'grpc',
        ipAddress: '185.201.8.42',
      });

      await tracker.upsertPeer({
        peerId: 'has_geo',
        source: 'grpc',
        ipAddress: '8.8.8.8',
      });
      await tracker.updateGeoData('has_geo', {
        country: 'USA',
        city: 'Mountain View',
        lat: 37.4,
        lon: -122.1,
        isp: 'Google',
      });

      await tracker.upsertPeer({
        peerId: 'no_ip',
        source: 'inferred',
      });

      const needsGeo = await tracker.getPeersNeedingGeoLookup();
      expect(needsGeo).toHaveLength(1);
      expect(needsGeo[0].peer_id).toBe('has_ip_no_geo');
    });

    it('returns peers with stale geo data', async () => {
      const staleTime = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago

      await db.execute({
        sql: `INSERT INTO peers (peer_id, source, first_seen, last_seen, ip_address, geo_country, geo_updated)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: ['stale_geo', 'grpc', staleTime, Date.now(), '1.2.3.4', 'OldCountry', staleTime],
      });

      const needsGeo = await tracker.getPeersNeedingGeoLookup(7);
      expect(needsGeo).toHaveLength(1);
      expect(needsGeo[0].peer_id).toBe('stale_geo');
    });
  });

  describe('getInferredPeers', () => {
    it('returns only inferred peers', async () => {
      await tracker.upsertPeer({ peerId: 'reporting1', source: 'reporting' });
      await tracker.upsertPeer({ peerId: 'grpc1', source: 'grpc' });
      await tracker.upsertPeer({ peerId: 'inferred1', source: 'inferred' });
      await tracker.upsertPeer({ peerId: 'inferred2', source: 'inferred' });

      const inferred = await tracker.getInferredPeers();
      expect(inferred).toHaveLength(2);
      expect(inferred.map(p => p.peer_id).sort()).toEqual(['inferred1', 'inferred2']);
    });
  });

  describe('updateSeenByCount', () => {
    it('updates seen_by_count for a peer', async () => {
      await tracker.upsertPeer({ peerId: 'ext1', source: 'inferred' });
      await tracker.recordConnection('r1', 'ext1');
      await tracker.recordConnection('r2', 'ext1');
      await tracker.recordConnection('r3', 'ext1');

      await tracker.updateSeenByCount('ext1');

      const peer = await tracker.getPeer('ext1');
      expect(peer!.seen_by_count).toBe(3);
    });
  });

  describe('detectBootstrappers', () => {
    it('marks peers with high connectivity as bootstrappers', async () => {
      // Create a peer seen by many nodes and stable for > 7 days
      const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago

      await db.execute({
        sql: `INSERT INTO peers (peer_id, source, first_seen, last_seen, seen_by_count)
              VALUES (?, ?, ?, ?, ?)`,
        args: ['likely_bootstrap', 'inferred', oldTime, Date.now(), 15],
      });

      await db.execute({
        sql: `INSERT INTO peers (peer_id, source, first_seen, last_seen, seen_by_count)
              VALUES (?, ?, ?, ?, ?)`,
        args: ['not_bootstrap', 'inferred', Date.now() - 1000, Date.now(), 2],
      });

      await tracker.detectBootstrappers(10, 7);

      const bootstrap = await tracker.getPeer('likely_bootstrap');
      const notBootstrap = await tracker.getPeer('not_bootstrap');

      expect(bootstrap!.is_bootstrapper).toBe(1);
      expect(notBootstrap!.is_bootstrapper).toBe(0);
    });
  });

  describe('getAllPeers', () => {
    it('returns all peers', async () => {
      await tracker.upsertPeer({ peerId: 'p1', source: 'reporting' });
      await tracker.upsertPeer({ peerId: 'p2', source: 'grpc' });
      await tracker.upsertPeer({ peerId: 'p3', source: 'inferred' });

      const all = await tracker.getAllPeers();
      expect(all).toHaveLength(3);
    });
  });
});
