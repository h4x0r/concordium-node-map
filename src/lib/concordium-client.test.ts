import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConcordiumClient, type PeerInfo } from './concordium-client';

// Mock the Concordium SDK
vi.mock('@concordium/web-sdk/nodejs', () => ({
  ConcordiumGRPCNodeClient: vi.fn().mockImplementation(() => ({
    getPeersInfo: vi.fn(),
    getNodeInfo: vi.fn(),
  })),
  credentials: {
    createInsecure: vi.fn(),
  },
}));

describe('ConcordiumClient', () => {
  let client: ConcordiumClient;

  beforeEach(() => {
    client = new ConcordiumClient('grpc.mainnet.concordium.software', 20000);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getPeersInfo', () => {
    it('returns peer info with IP addresses', async () => {
      const mockPeers: PeerInfo[] = [
        {
          peerId: 'abc123def456',
          ipAddress: '185.201.8.42',
          port: 10000,
          catchupStatus: 'UPTODATE',
          latencyMs: 45,
          packetsSent: 1000,
          packetsReceived: 950,
          isBootstrapper: false,
        },
        {
          peerId: 'xyz789uvw012',
          ipAddress: '142.250.185.78',
          port: 10000,
          catchupStatus: 'PENDING',
          latencyMs: 120,
          packetsSent: 500,
          packetsReceived: 480,
          isBootstrapper: true,
        },
      ];

      // Mock the internal client
      vi.spyOn(client as any, 'fetchPeersInfo').mockResolvedValue(mockPeers);

      const result = await client.getPeersInfo();

      expect(result).toHaveLength(2);
      expect(result[0].peerId).toBe('abc123def456');
      expect(result[0].ipAddress).toBe('185.201.8.42');
      expect(result[0].catchupStatus).toBe('UPTODATE');
      expect(result[1].isBootstrapper).toBe(true);
    });

    it('returns empty array on connection error', async () => {
      vi.spyOn(client as any, 'fetchPeersInfo').mockRejectedValue(
        new Error('Connection refused')
      );

      const result = await client.getPeersInfo();

      expect(result).toEqual([]);
    });

    it('handles timeout gracefully', async () => {
      vi.spyOn(client as any, 'fetchPeersInfo').mockRejectedValue(
        new Error('Timeout')
      );

      const result = await client.getPeersInfo();

      expect(result).toEqual([]);
    });
  });

  describe('parseCatchupStatus', () => {
    it('parses catchup status correctly', () => {
      expect(client.parseCatchupStatus(0)).toBe('UPTODATE');
      expect(client.parseCatchupStatus(1)).toBe('PENDING');
      expect(client.parseCatchupStatus(2)).toBe('CATCHINGUP');
      expect(client.parseCatchupStatus(99)).toBe('UPTODATE');
    });
  });

  describe('formatPeerId', () => {
    it('formats peer ID to hex string', () => {
      // Peer IDs are BigInt in the SDK
      expect(client.formatPeerId(BigInt('0x43b5689f08701334'))).toBe('43b5689f08701334');
      expect(client.formatPeerId(BigInt('123456789'))).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('isConnected', () => {
    it('returns true when client can reach endpoint', async () => {
      vi.spyOn(client as any, 'fetchPeersInfo').mockResolvedValue([]);

      const connected = await client.isConnected();

      expect(connected).toBe(true);
    });

    it('returns false when client cannot reach endpoint', async () => {
      vi.spyOn(client as any, 'fetchPeersInfo').mockRejectedValue(
        new Error('Connection refused')
      );

      const connected = await client.isConnected();

      expect(connected).toBe(false);
    });
  });
});
