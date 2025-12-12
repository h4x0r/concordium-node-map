import { describe, it, expect } from 'vitest';
import { inferRegion, REGIONS, type Region, toLeafletMarkers } from './geo-inference';
import type { ConcordiumNode } from './transforms';

describe('inferRegion', () => {
  describe('city/country patterns', () => {
    it('maps London to europe-west', () => {
      expect(inferRegion('TT-London')).toBe('europe-west');
      expect(inferRegion('node-london-01')).toBe('europe-west');
    });

    it('maps Netherlands patterns to europe-west', () => {
      expect(inferRegion('CCD-NL')).toBe('europe-west');
      expect(inferRegion('amsterdam-node')).toBe('europe-west');
    });

    it('maps Nordic patterns to europe-north', () => {
      expect(inferRegion('BitNordic.com')).toBe('europe-north');
      expect(inferRegion('sweden-validator')).toBe('europe-north');
      expect(inferRegion('norway-node')).toBe('europe-north');
      expect(inferRegion('finland-01')).toBe('europe-north');
      expect(inferRegion('denmark-baker')).toBe('europe-north');
    });

    it('maps Swiss patterns to europe-west', () => {
      expect(inferRegion('Luganodes')).toBe('europe-west');
      expect(inferRegion('zurich-node')).toBe('europe-west');
      expect(inferRegion('switzerland-baker')).toBe('europe-west');
    });

    it('maps US patterns to north-america', () => {
      expect(inferRegion('US-East-01')).toBe('north-america');
      expect(inferRegion('nyc-validator')).toBe('north-america');
      expect(inferRegion('chicago-node')).toBe('north-america');
      expect(inferRegion('seattle-baker')).toBe('north-america');
    });

    it('maps Asian patterns correctly', () => {
      expect(inferRegion('singapore-node')).toBe('asia-south');
      expect(inferRegion('tokyo-validator')).toBe('asia-east');
      expect(inferRegion('seoul-baker')).toBe('asia-east');
    });

    it('maps Australian patterns to oceania', () => {
      expect(inferRegion('sydney-node')).toBe('oceania');
      expect(inferRegion('melbourne-baker')).toBe('oceania');
      expect(inferRegion('AU-validator')).toBe('oceania');
    });
  });

  describe('known provider patterns', () => {
    it('maps figment to north-america', () => {
      expect(inferRegion('figment-mainnet-01')).toBe('north-america');
    });

    it('maps bitnordic to europe-north', () => {
      expect(inferRegion('bitnordic-validator')).toBe('europe-north');
    });

    it('maps luganodes to europe-west', () => {
      expect(inferRegion('luganodes-baker')).toBe('europe-west');
    });
  });

  describe('unknown patterns', () => {
    it('returns unknown for unrecognized names', () => {
      expect(inferRegion('random-node-xyz')).toBe('unknown');
      expect(inferRegion('validator-123')).toBe('unknown');
      expect(inferRegion('')).toBe('unknown');
    });
  });

  describe('case insensitivity', () => {
    it('matches regardless of case', () => {
      expect(inferRegion('LONDON-NODE')).toBe('europe-west');
      expect(inferRegion('Singapore')).toBe('asia-south');
      expect(inferRegion('FIGMENT-MAINNET')).toBe('north-america');
    });
  });
});

describe('REGIONS', () => {
  it('has all expected regions defined', () => {
    const expectedRegions: Region[] = [
      'north-america',
      'europe-west',
      'europe-north',
      'europe-east',
      'asia-east',
      'asia-south',
      'oceania',
      'south-america',
      'africa',
      'unknown',
    ];

    for (const region of expectedRegions) {
      expect(REGIONS[region]).toBeDefined();
      expect(REGIONS[region].lat).toBeTypeOf('number');
      expect(REGIONS[region].lng).toBeTypeOf('number');
      expect(REGIONS[region].label).toBeTypeOf('string');
    }
  });
});

describe('toLeafletMarkers', () => {
  const createMockNode = (nodeId: string, nodeName: string): ConcordiumNode =>
    ({
      nodeId,
      nodeName,
      peerType: 'Node',
      client: 'concordium-node/6.3.0',
      peersCount: 5,
      peersList: [],
      averagePing: 50,
      averageBytesPerSecondIn: 1000,
      averageBytesPerSecondOut: 800,
      bestBlock: 'abc123',
      bestBlockHeight: 1000,
      finalizedBlock: 'def456',
      finalizedBlockHeight: 998,
      consensusRunning: true,
      bakingCommitteeMember: 'NotInCommittee',
      finalizationCommitteeMember: false,
      consensusBakerId: null,
      uptime: 86400000,
      blockArrivePeriodEMA: 10.5,
      blockReceivePeriodEMA: 10.2,
      transactionsPerBlockEMA: 2.5,
    }) as ConcordiumNode;

  it('groups nodes by inferred region', () => {
    const nodes = [
      createMockNode('1', 'london-node'),
      createMockNode('2', 'paris-node'),
      createMockNode('3', 'tokyo-node'),
      createMockNode('4', 'unknown-xyz'),
    ];

    const markers = toLeafletMarkers(nodes);

    // Should have clusters for europe-west, asia-east, and unknown
    expect(markers.length).toBeGreaterThanOrEqual(3);

    const europeWest = markers.find((m) => m.region === 'europe-west');
    expect(europeWest).toBeDefined();
    expect(europeWest!.nodes).toHaveLength(2); // london and paris

    const asiaEast = markers.find((m) => m.region === 'asia-east');
    expect(asiaEast).toBeDefined();
    expect(asiaEast!.nodes).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(toLeafletMarkers([])).toEqual([]);
  });

  it('includes correct coordinates for each cluster', () => {
    const nodes = [createMockNode('1', 'london-node')];

    const markers = toLeafletMarkers(nodes);

    expect(markers[0].lat).toBe(REGIONS['europe-west'].lat);
    expect(markers[0].lng).toBe(REGIONS['europe-west'].lng);
  });
});
