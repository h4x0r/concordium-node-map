import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { InferenceEngine } from './InferenceEngine';
import { PeerTracker } from './PeerTracker';
import { createTestDb } from './test-helpers';

describe('InferenceEngine', () => {
  let db: Client;
  let engine: InferenceEngine;
  let peerTracker: PeerTracker;

  beforeEach(async () => {
    db = await createTestDb();
    peerTracker = new PeerTracker(db);
    engine = new InferenceEngine(db, peerTracker);
  });

  afterEach(() => {
    db.close();
  });

  describe('inferLocation', () => {
    it('returns null for peer with no connections', async () => {
      // Create an isolated peer with no connections
      await peerTracker.upsertPeer({
        peerId: 'isolated-peer',
        source: 'inferred',
      });

      const location = await engine.inferLocation('isolated-peer');

      expect(location).toBeNull();
    });

    it('infers location from single connected peer with geo data', async () => {
      // Create a reporting peer with known location
      await peerTracker.upsertPeer({
        peerId: 'reporter-1',
        source: 'reporting',
        ipAddress: '1.2.3.4',
      });
      await peerTracker.updateGeoData('reporter-1', {
        country: 'Germany',
        city: 'Berlin',
        lat: 52.52,
        lon: 13.405,
        isp: 'Test ISP',
      });

      // Create an inferred peer seen by the reporter
      await peerTracker.upsertPeer({
        peerId: 'inferred-peer',
        source: 'inferred',
      });
      await peerTracker.recordConnection('reporter-1', 'inferred-peer');

      const location = await engine.inferLocation('inferred-peer');

      expect(location).not.toBeNull();
      expect(location!.lat).toBeCloseTo(52.52, 1);
      expect(location!.lon).toBeCloseTo(13.405, 1);
      expect(location!.confidence).toBe('low'); // Only 1 source
    });

    it('calculates centroid from multiple connected peers', async () => {
      // Create three reporting peers with known locations forming a triangle
      const reporters = [
        { id: 'reporter-1', lat: 52.52, lon: 13.405 }, // Berlin
        { id: 'reporter-2', lat: 48.8566, lon: 2.3522 }, // Paris
        { id: 'reporter-3', lat: 51.5074, lon: -0.1278 }, // London
      ];

      for (const r of reporters) {
        await peerTracker.upsertPeer({
          peerId: r.id,
          source: 'reporting',
          ipAddress: `1.2.3.${reporters.indexOf(r)}`,
        });
        await peerTracker.updateGeoData(r.id, {
          country: 'EU',
          city: 'City',
          lat: r.lat,
          lon: r.lon,
          isp: 'ISP',
        });
      }

      // Create an inferred peer seen by all three reporters
      await peerTracker.upsertPeer({
        peerId: 'central-peer',
        source: 'inferred',
      });
      for (const r of reporters) {
        await peerTracker.recordConnection(r.id, 'central-peer');
      }

      const location = await engine.inferLocation('central-peer');

      expect(location).not.toBeNull();
      // Centroid should be roughly in the middle
      const expectedLat = (52.52 + 48.8566 + 51.5074) / 3;
      const expectedLon = (13.405 + 2.3522 + -0.1278) / 3;
      expect(location!.lat).toBeCloseTo(expectedLat, 1);
      expect(location!.lon).toBeCloseTo(expectedLon, 1);
      expect(location!.confidence).toBe('high'); // 3+ sources
    });

    it('sets confidence based on number of sources', async () => {
      // Create two reporters
      for (let i = 0; i < 2; i++) {
        await peerTracker.upsertPeer({
          peerId: `reporter-${i}`,
          source: 'reporting',
          ipAddress: `1.2.3.${i}`,
        });
        await peerTracker.updateGeoData(`reporter-${i}`, {
          country: 'EU',
          city: 'City',
          lat: 50 + i,
          lon: 10 + i,
          isp: 'ISP',
        });
      }

      await peerTracker.upsertPeer({
        peerId: 'target-peer',
        source: 'inferred',
      });
      await peerTracker.recordConnection('reporter-0', 'target-peer');
      await peerTracker.recordConnection('reporter-1', 'target-peer');

      const location = await engine.inferLocation('target-peer');

      expect(location).not.toBeNull();
      expect(location!.confidence).toBe('medium'); // 2 sources
    });
  });

  describe('detectBootstrappers', () => {
    it('marks peers with high connectivity as bootstrappers', async () => {
      // Create a well-connected peer (seen by 10 reporters)
      await peerTracker.upsertPeer({
        peerId: 'bootstrap-candidate',
        source: 'grpc',
        ipAddress: '10.0.0.1',
      });

      // Simulate being seen by 10 different reporters
      for (let i = 0; i < 10; i++) {
        await peerTracker.upsertPeer({
          peerId: `reporter-${i}`,
          source: 'reporting',
        });
        await peerTracker.recordConnection(`reporter-${i}`, 'bootstrap-candidate');
      }
      await peerTracker.updateSeenByCount('bootstrap-candidate');

      // Make it "old" enough by updating first_seen
      const sevenDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      await db.execute({
        sql: 'UPDATE peers SET first_seen = ? WHERE peer_id = ?',
        args: [sevenDaysAgo, 'bootstrap-candidate'],
      });

      await engine.detectBootstrappers();

      const peer = await peerTracker.getPeer('bootstrap-candidate');
      expect(peer?.is_bootstrapper).toBe(1);
    });

    it('does not mark low-connectivity peers as bootstrappers', async () => {
      // Create a peer seen by only 3 reporters
      await peerTracker.upsertPeer({
        peerId: 'regular-peer',
        source: 'grpc',
      });

      for (let i = 0; i < 3; i++) {
        await peerTracker.upsertPeer({
          peerId: `reporter-${i}`,
          source: 'reporting',
        });
        await peerTracker.recordConnection(`reporter-${i}`, 'regular-peer');
      }
      await peerTracker.updateSeenByCount('regular-peer');

      await engine.detectBootstrappers();

      const peer = await peerTracker.getPeer('regular-peer');
      expect(peer?.is_bootstrapper).toBe(0);
    });

    it('does not mark new peers as bootstrappers', async () => {
      // Create a high-connectivity but new peer
      await peerTracker.upsertPeer({
        peerId: 'new-popular-peer',
        source: 'grpc',
      });

      for (let i = 0; i < 15; i++) {
        await peerTracker.upsertPeer({
          peerId: `reporter-${i}`,
          source: 'reporting',
        });
        await peerTracker.recordConnection(`reporter-${i}`, 'new-popular-peer');
      }
      await peerTracker.updateSeenByCount('new-popular-peer');

      // Peer is new (first_seen is now)
      await engine.detectBootstrappers();

      const peer = await peerTracker.getPeer('new-popular-peer');
      expect(peer?.is_bootstrapper).toBe(0);
    });
  });

  describe('calculateNetworkCentrality', () => {
    it('returns 0 for isolated peer', async () => {
      await peerTracker.upsertPeer({
        peerId: 'isolated',
        source: 'inferred',
      });

      const centrality = await engine.calculateNetworkCentrality('isolated');

      expect(centrality).toBe(0);
    });

    it('returns higher centrality for well-connected peers', async () => {
      // Create two peers with different connectivity
      await peerTracker.upsertPeer({ peerId: 'popular', source: 'grpc' });
      await peerTracker.upsertPeer({ peerId: 'unpopular', source: 'grpc' });

      // Popular is seen by 5 reporters
      for (let i = 0; i < 5; i++) {
        await peerTracker.upsertPeer({
          peerId: `reporter-${i}`,
          source: 'reporting',
        });
        await peerTracker.recordConnection(`reporter-${i}`, 'popular');
      }
      await peerTracker.updateSeenByCount('popular');

      // Unpopular is seen by only 1 reporter
      await peerTracker.recordConnection('reporter-0', 'unpopular');
      await peerTracker.updateSeenByCount('unpopular');

      const popularCentrality = await engine.calculateNetworkCentrality('popular');
      const unpopularCentrality = await engine.calculateNetworkCentrality('unpopular');

      expect(popularCentrality).toBeGreaterThan(unpopularCentrality);
      expect(popularCentrality).toBe(5);
      expect(unpopularCentrality).toBe(1);
    });
  });

  describe('getInferredPeersWithoutLocation', () => {
    it('returns inferred peers that have no geo data', async () => {
      // Create an inferred peer without geo data
      await peerTracker.upsertPeer({
        peerId: 'no-geo-peer',
        source: 'inferred',
      });

      // Create a grpc peer with geo data
      await peerTracker.upsertPeer({
        peerId: 'has-geo-peer',
        source: 'grpc',
        ipAddress: '1.2.3.4',
      });
      await peerTracker.updateGeoData('has-geo-peer', {
        country: 'US',
        city: 'NYC',
        lat: 40.7,
        lon: -74.0,
        isp: 'ISP',
      });

      const needsInference = await engine.getInferredPeersWithoutLocation();

      expect(needsInference).toHaveLength(1);
      expect(needsInference[0].peer_id).toBe('no-geo-peer');
    });
  });

  describe('inferAllLocations', () => {
    it('infers locations for all peers without geo data', async () => {
      // Setup: Create reporters with geo data
      await peerTracker.upsertPeer({
        peerId: 'reporter-1',
        source: 'reporting',
        ipAddress: '1.2.3.4',
      });
      await peerTracker.updateGeoData('reporter-1', {
        country: 'Germany',
        city: 'Berlin',
        lat: 52.52,
        lon: 13.405,
        isp: 'ISP',
      });

      // Create multiple inferred peers without geo
      await peerTracker.upsertPeer({ peerId: 'inferred-1', source: 'inferred' });
      await peerTracker.upsertPeer({ peerId: 'inferred-2', source: 'inferred' });
      await peerTracker.recordConnection('reporter-1', 'inferred-1');
      await peerTracker.recordConnection('reporter-1', 'inferred-2');

      const results = await engine.inferAllLocations();

      expect(results.inferred).toBe(2);
      expect(results.failed).toBe(0);
    });
  });
});
