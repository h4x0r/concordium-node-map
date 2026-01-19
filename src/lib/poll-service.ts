import type { Client } from '@libsql/client';
import { PeerTracker } from './db/PeerTracker';
import { InferenceEngine } from './db/InferenceEngine';
import { GeoLookupService } from './geo-lookup';
import { ValidatorTracker, type ConsensusVisibility, type ReportingPeer } from './db/ValidatorTracker';
import { ValidatorFetcher, type FetchResult } from './ValidatorFetcher';
import type { PeerInfo } from './concordium-client';
import type { NodeSummary } from './db/NodeTracker';

export interface PollStats {
  reportingNodesProcessed: number;
  grpcPeersProcessed: number;
  extNodesIdentified: number;
  geoLookupsAttempted: number;
  geoLookupsSucceeded: number;
  locationsInferred: number;
  bootstrappersDetected: number;
  peersTableCount: number;
}

export interface GeoUpdateStats {
  attempted: number;
  succeeded: number;
  failed: number;
}

export interface InferenceStats {
  locationsInferred: number;
  locationsFailed: number;
  bootstrappersDetected: number;
}

export interface ValidatorPollStats {
  totalValidators: number;
  visibleValidators: number;
  phantomValidators: number;
  newValidators: number;
  stakeVisibilityPct: number;
  quorumHealth: 'healthy' | 'degraded' | 'critical';
  fetchErrors: string[];
}

/**
 * Orchestrates polling of all data sources and processing.
 * Integrates reporting nodes, gRPC peers, geo lookup, inference, and validators.
 */
export class PollService {
  private peerTracker: PeerTracker;
  private inferenceEngine: InferenceEngine;
  private geoLookup: GeoLookupService;
  private validatorTracker: ValidatorTracker;
  private validatorFetcher: ValidatorFetcher;

  constructor(db: Client) {
    this.peerTracker = new PeerTracker(db);
    this.inferenceEngine = new InferenceEngine(db, this.peerTracker);
    this.geoLookup = new GeoLookupService();
    this.validatorTracker = new ValidatorTracker(db);
    this.validatorFetcher = new ValidatorFetcher(
      'grpc.mainnet.concordium.software',
      20000,
      { cacheTtlMs: 5 * 60 * 1000 } // 5 minute cache
    );
  }

  /**
   * Process reporting nodes from nodesSummary API.
   * These are nodes that actively report to the dashboard.
   */
  async processReportingNodes(nodes: NodeSummary[]): Promise<number> {
    for (const node of nodes) {
      await this.peerTracker.upsertPeer({
        peerId: node.nodeId,
        source: 'reporting',
        nodeName: node.nodeName,
        clientVersion: node.client,
      });
    }
    return nodes.length;
  }

  /**
   * Process peers discovered via gRPC.
   * These have IP addresses and network stats.
   */
  async processGrpcPeers(
    peers: PeerInfo[],
    reporterId: string
  ): Promise<number> {
    for (const peer of peers) {
      await this.peerTracker.upsertPeer({
        peerId: peer.peerId,
        source: 'grpc',
        ipAddress: peer.ipAddress,
        port: peer.port,
        catchupStatus: peer.catchupStatus,
        grpcLatencyMs: peer.latencyMs,
        packetsSent: peer.packetsSent,
        packetsReceived: peer.packetsReceived,
      });

      // If gRPC says it's a bootstrapper, mark it
      if (peer.isBootstrapper) {
        await this.peerTracker.upsertPeer({
          peerId: peer.peerId,
          source: 'grpc',
        });
        // Update bootstrapper flag directly
        const db = this.getDb();
        await db.execute({
          sql: 'UPDATE peers SET is_bootstrapper = 1 WHERE peer_id = ?',
          args: [peer.peerId],
        });
      }

      // Record the connection
      await this.peerTracker.recordConnection(reporterId, peer.peerId);
    }
    return peers.length;
  }

  /**
   * Identify EXT nodes from peer references.
   * These are peer IDs mentioned by reporting nodes but not seen via gRPC.
   * Creates inferred records for them.
   */
  async identifyExtNodes(
    extPeerIds: string[],
    reporterId: string
  ): Promise<number> {
    let count = 0;
    for (const peerId of extPeerIds) {
      // Check if peer already exists
      const existing = await this.peerTracker.getPeer(peerId);

      if (!existing) {
        // Create inferred record
        await this.peerTracker.upsertPeer({
          peerId,
          source: 'inferred',
        });
        count++;
      }

      // Record the connection regardless
      await this.peerTracker.recordConnection(reporterId, peerId);
    }
    return count;
  }

  /**
   * Update geo locations for peers with IPs but no geo data.
   */
  async updateGeoLocations(): Promise<GeoUpdateStats> {
    const peers = await this.peerTracker.getPeersNeedingGeoLookup();

    let succeeded = 0;
    let failed = 0;

    for (const peer of peers) {
      if (!peer.ip_address) continue;

      const geo = await this.geoLookup.lookupIP(peer.ip_address);
      if (geo && geo.country && geo.lat !== undefined && geo.lon !== undefined) {
        await this.peerTracker.updateGeoData(peer.peer_id, {
          country: geo.country,
          city: geo.city || 'Unknown',
          lat: geo.lat,
          lon: geo.lon,
          isp: geo.isp || 'Unknown',
        });
        succeeded++;
      } else {
        failed++;
      }
    }

    return {
      attempted: peers.length,
      succeeded,
      failed,
    };
  }

  /**
   * Run inference engine to calculate inferred locations and detect bootstrappers.
   */
  async runInference(): Promise<InferenceStats> {
    // Infer locations
    const locationResults = await this.inferenceEngine.inferAllLocations();

    // Detect bootstrappers
    await this.inferenceEngine.detectBootstrappers();

    // Count bootstrappers
    const db = this.getDb();
    const bootstrapperCount = await db.execute(
      'SELECT COUNT(*) as count FROM peers WHERE is_bootstrapper = 1'
    );

    return {
      locationsInferred: locationResults.inferred,
      locationsFailed: locationResults.failed,
      bootstrappersDetected: Number(bootstrapperCount.rows[0].count),
    };
  }

  /**
   * Process validators from chain data with timeout protection.
   * Fetches all bakers from gRPC and links to reporting peers.
   * Times out after 30 seconds to prevent blocking the cron job.
   */
  async processValidators(reportingNodes: NodeSummary[]): Promise<ValidatorPollStats> {
    const errors: string[] = [];
    const VALIDATOR_TIMEOUT_MS = 30000; // 30 second timeout

    try {
      // Fetch all validators from chain with timeout
      const fetchPromise = this.validatorFetcher.fetchAllValidators();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Validator fetch timed out after 30s')), VALIDATOR_TIMEOUT_MS)
      );

      const fetchResult: FetchResult = await Promise.race([fetchPromise, timeoutPromise]);

      if (fetchResult.errors.length > 0) {
        errors.push(...fetchResult.errors);
      }

      // Build reporting peer list from nodes with consensus baker IDs
      // Get baker IDs from the peers table where we have them
      const db = this.getDb();
      const peersWithBakers = await db.execute(`
        SELECT peer_id, consensus_baker_id, node_name
        FROM peers
        WHERE consensus_baker_id IS NOT NULL
      `);

      const reportingPeers: ReportingPeer[] = peersWithBakers.rows.map((row) => ({
        peerId: row.peer_id as string,
        consensusBakerId: row.consensus_baker_id as number | null,
        nodeName: row.node_name as string,
      }));

      // Also include reporting nodes that have baker IDs from dashboard API
      for (const node of reportingNodes) {
        // Skip if already in the list
        if (reportingPeers.some(p => p.peerId === node.nodeId)) continue;

        // Use consensusBakerId from dashboard if available
        reportingPeers.push({
          peerId: node.nodeId,
          consensusBakerId: node.consensusBakerId ?? null,
          nodeName: node.nodeName,
        });
      }

      // Process validators with the ValidatorTracker
      const result = await this.validatorTracker.processValidators(
        fetchResult.validators,
        reportingPeers
      );

      // Record a consensus snapshot
      await this.validatorTracker.recordConsensusSnapshot();

      // Get visibility metrics
      const visibility: ConsensusVisibility = await this.validatorTracker.calculateConsensusVisibility();

      return {
        totalValidators: result.totalProcessed,
        visibleValidators: result.visibleCount,
        phantomValidators: result.phantomCount,
        newValidators: result.newValidators.length,
        stakeVisibilityPct: visibility.stakeVisibilityPct,
        quorumHealth: visibility.quorumHealth,
        fetchErrors: errors,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Validator processing failed: ${msg}`);

      return {
        totalValidators: 0,
        visibleValidators: 0,
        phantomValidators: 0,
        newValidators: 0,
        stakeVisibilityPct: 0,
        quorumHealth: 'critical',
        fetchErrors: errors,
      };
    }
  }

  /**
   * Get the ValidatorTracker instance for direct access
   */
  getValidatorTracker(): ValidatorTracker {
    return this.validatorTracker;
  }

  /**
   * Run a complete poll cycle.
   * Processes reporting nodes, gRPC peers (if available), geo lookups, and inference.
   */
  async pollComplete(nodes: NodeSummary[]): Promise<PollStats> {
    // Step 1: Process reporting nodes
    const reportingCount = await this.processReportingNodes(nodes);

    // Step 2: gRPC peers would be processed externally (requires async gRPC calls)
    // This is typically done by the caller before calling pollComplete

    // Step 3: Update geo locations
    const geoStats = await this.updateGeoLocations();

    // Step 4: Run inference
    const inferenceStats = await this.runInference();

    // Get total peer count
    const db = this.getDb();
    const peerCount = await db.execute('SELECT COUNT(*) as count FROM peers');

    return {
      reportingNodesProcessed: reportingCount,
      grpcPeersProcessed: 0, // Set by caller if gRPC was used
      extNodesIdentified: 0, // Set by caller if EXT identification was done
      geoLookupsAttempted: geoStats.attempted,
      geoLookupsSucceeded: geoStats.succeeded,
      locationsInferred: inferenceStats.locationsInferred,
      bootstrappersDetected: inferenceStats.bootstrappersDetected,
      peersTableCount: Number(peerCount.rows[0].count),
    };
  }

  /**
   * Get the database client (for direct queries).
   * This is a workaround to access the db from PeerTracker.
   */
  private getDb(): Client {
    // Access via the peerTracker's private db
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.peerTracker as any).db;
  }
}
