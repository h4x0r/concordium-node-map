/**
 * Concordium gRPC client wrapper for fetching peer information
 * Uses the official @concordium/web-sdk
 */

import type { CatchupStatus } from './db/schema';

export interface PeerInfo {
  peerId: string;
  ipAddress: string;
  port: number;
  catchupStatus: CatchupStatus;
  latencyMs: number;
  packetsSent: number;
  packetsReceived: number;
  isBootstrapper: boolean;
}

const DEFAULT_TIMEOUT = 10000; // 10 seconds

export class ConcordiumClient {
  private host: string;
  private port: number;
  private timeout: number;

  constructor(host: string, port: number, timeout: number = DEFAULT_TIMEOUT) {
    this.host = host;
    this.port = port;
    this.timeout = timeout;
  }

  /**
   * Parse catchup status from gRPC enum value
   */
  parseCatchupStatus(value: number): CatchupStatus {
    switch (value) {
      case 0:
        return 'UPTODATE';
      case 1:
        return 'PENDING';
      case 2:
        return 'CATCHINGUP';
      default:
        return 'UPTODATE';
    }
  }

  /**
   * Format peer ID from BigInt to hex string
   */
  formatPeerId(peerId: bigint): string {
    return peerId.toString(16).padStart(16, '0');
  }

  /**
   * Internal method to fetch peers info from gRPC
   * Can be mocked in tests
   */
  protected async fetchPeersInfo(): Promise<PeerInfo[]> {
    // Dynamic import to avoid issues with SSR/bundling
    const { ConcordiumGRPCNodeClient, credentials } = await import(
      '@concordium/web-sdk/nodejs'
    );

    const client = new ConcordiumGRPCNodeClient(
      this.host,
      this.port,
      credentials.createInsecure(),
      { timeout: this.timeout }
    );

    try {
      const peersInfo = await client.getPeersInfo();
      const peers: PeerInfo[] = [];

      for (const peerData of peersInfo) {
        // Cast to any to handle SDK type variations
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const peer = peerData as any;

        // Extract IP and port from socket address
        const socketAddress = peer.socketAddress;
        if (!socketAddress) continue;

        const ip = socketAddress.ip?.value;
        const port = socketAddress.port?.value;

        if (!ip || !port) continue;

        // Determine if bootstrapper
        const isBootstrapper = peer.consensusInfo?.tag === 'bootstrapper';

        // Get catchup status for non-bootstrappers
        let catchupStatus: CatchupStatus = 'UPTODATE';
        if (!isBootstrapper && peer.consensusInfo?.tag === 'nodeCatchupStatus') {
          const status = peer.consensusInfo.value;
          if (typeof status === 'number') {
            catchupStatus = this.parseCatchupStatus(status);
          }
        }

        // Extract network stats
        const networkStats = peer.networkStats;
        const latencyMs = networkStats?.latency ? Number(networkStats.latency) : 0;
        const packetsSent = networkStats?.packetsSent
          ? Number(networkStats.packetsSent)
          : 0;
        const packetsReceived = networkStats?.packetsReceived
          ? Number(networkStats.packetsReceived)
          : 0;

        peers.push({
          peerId: this.formatPeerId(peer.peerId?.value ?? BigInt(0)),
          ipAddress: ip,
          port: Number(port),
          catchupStatus,
          latencyMs,
          packetsSent,
          packetsReceived,
          isBootstrapper,
        });
      }

      return peers;
    } finally {
      // Clean up client connection
      // Note: SDK may not have explicit close method
    }
  }

  /**
   * Get peer information from the Concordium node
   * Returns empty array on error
   */
  async getPeersInfo(): Promise<PeerInfo[]> {
    try {
      return await this.fetchPeersInfo();
    } catch (error) {
      console.error('Failed to fetch peers info:', error);
      return [];
    }
  }

  /**
   * Check if the client can connect to the endpoint
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.fetchPeersInfo();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Default client for mainnet public gRPC endpoint
 */
export function createMainnetClient(): ConcordiumClient {
  return new ConcordiumClient('grpc.mainnet.concordium.software', 20000);
}
