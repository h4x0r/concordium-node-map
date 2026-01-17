import { NextResponse } from 'next/server';
import { getDbClient, initializeSchema, cleanupOldData } from '@/lib/db/client';
import { NodeTracker, type NodeSummary } from '@/lib/db/NodeTracker';
import { PollService } from '@/lib/poll-service';
import { ConcordiumClient } from '@/lib/concordium-client';
import { calculateNetworkPulse } from '@/lib/pulse';
import type { HealthStatus } from '@/lib/db/schema';

// Fluid Compute (Pro plan): up to 800s max
// Setting to 300s to test if Fluid Compute is actually applying
// If still times out at 60s, Fluid Compute isn't working
export const maxDuration = 300;

// Force Node.js runtime (not Edge) for gRPC support
export const runtime = 'nodejs';

// Prevent caching
export const dynamic = 'force-dynamic';

// Concordium dashboard API
const NODES_SUMMARY_URL = 'https://dashboard.mainnet.concordium.software/nodesSummary';

// Public gRPC endpoints for peer discovery
const GRPC_ENDPOINTS = [
  { host: 'grpc.mainnet.concordium.software', port: 20000 },
];

// Secret to protect the cron endpoint (set in Vercel env)
const CRON_SECRET = process.env.CRON_SECRET;

// Feature flags to skip slow gRPC operations (for debugging timeouts)
const SKIP_VALIDATORS = process.env.SKIP_VALIDATORS === 'true';
const SKIP_GRPC_PEERS = process.env.SKIP_GRPC_PEERS === 'true';

/**
 * Fetch nodes from the Concordium dashboard API
 */
async function fetchNodesSummary(): Promise<NodeSummary[]> {
  const response = await fetch(NODES_SUMMARY_URL, {
    headers: {
      'Accept': 'application/json',
    },
    // Disable caching for fresh data
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch nodes: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Map API response to our NodeSummary type
  return data.map((node: Record<string, unknown>) => ({
    nodeId: node.nodeId as string,
    nodeName: node.nodeName as string,
    peerType: node.peerType as string,
    client: node.client as string,
    peersCount: node.peersCount as number,
    averagePing: node.averagePing as number | null,
    uptime: node.uptime as number,
    finalizedBlockHeight: node.finalizedBlockHeight as number,
    bestBlockHeight: node.bestBlockHeight as number,
    consensusRunning: node.consensusRunning as boolean,
    averageBytesPerSecondIn: node.averageBytesPerSecondIn as number | null,
    averageBytesPerSecondOut: node.averageBytesPerSecondOut as number | null,
  }));
}

/**
 * Process the poll job (shared between GET and POST)
 */
async function processPollJob(verbose: boolean = false) {
  const timings: Record<string, number> = {};
  const startTime = Date.now();

  // Initialize database (idempotent)
  await initializeSchema();
  const db = getDbClient();
  const tracker = new NodeTracker(db);
  const pollService = new PollService(db);
  timings['init'] = Date.now() - startTime;

  // Fetch current nodes from dashboard API
  const fetchStart = Date.now();
  const nodes = await fetchNodesSummary();
  timings['fetchNodes'] = Date.now() - fetchStart;

  if (nodes.length === 0) {
    return {
      error: 'No nodes returned from API',
      status: 502,
    };
  }

  // Calculate max height for health calculation
  const maxHeight = Math.max(...nodes.map(n => n.finalizedBlockHeight));

  // Process nodes and detect changes (existing behavior)
  const processStart = Date.now();
  const result = await tracker.processNodes(nodes, maxHeight);
  timings['processNodes'] = Date.now() - processStart;

  // NEW: Process reporting nodes in peers table
  const reportingStart = Date.now();
  await pollService.processReportingNodes(nodes);
  timings['processReporting'] = Date.now() - reportingStart;

  // Poll gRPC endpoints for peer data (IPs, network stats)
  // Can be skipped via SKIP_GRPC_PEERS=true env var for debugging timeouts
  const grpcStart = Date.now();
  let grpcPeersTotal = 0;
  const grpcErrors: string[] = [];

  if (SKIP_GRPC_PEERS) {
    grpcErrors.push('Skipped: SKIP_GRPC_PEERS=true');
  } else {
    for (const endpoint of GRPC_ENDPOINTS) {
      try {
        const client = new ConcordiumClient(endpoint.host, endpoint.port);
        const peers = await client.getPeersInfo();
        if (peers.length > 0) {
          await pollService.processGrpcPeers(peers, `grpc:${endpoint.host}`);
          grpcPeersTotal += peers.length;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        grpcErrors.push(`${endpoint.host}: ${msg}`);
        console.warn(`gRPC poll failed for ${endpoint.host}:`, error);
      }
    }
  }
  timings['grpcPeers'] = Date.now() - grpcStart;

  // Update geo locations for peers with IPs
  const geoStart = Date.now();
  const geoStats = await pollService.updateGeoLocations();
  timings['geoLookup'] = Date.now() - geoStart;

  // Run inference engine (location inference, bootstrapper detection)
  const inferenceStart = Date.now();
  const inferenceStats = await pollService.runInference();
  timings['inference'] = Date.now() - inferenceStart;

  // Process validators (fetch from chain, link to reporting peers)
  // Can be skipped via SKIP_VALIDATORS=true env var for debugging timeouts
  const validatorStart = Date.now();
  const validatorStats = SKIP_VALIDATORS
    ? {
        totalValidators: 0,
        visibleValidators: 0,
        phantomValidators: 0,
        newValidators: 0,
        stakeVisibilityPct: 0,
        quorumHealth: 'critical' as const,
        fetchErrors: ['Skipped: SKIP_VALIDATORS=true'],
      }
    : await pollService.processValidators(nodes);
  timings['validators'] = Date.now() - validatorStart;

  // Calculate network-wide metrics
  const now = Date.now();
  timings['total'] = now - startTime;
  const totalNodes = nodes.length;

  // Health counts based on finalization lag
  const calculateHealth = (lag: number, consensusRunning: boolean): HealthStatus => {
    if (!consensusRunning) return 'issue';
    if (lag <= 2) return 'healthy';
    if (lag <= 5) return 'lagging';
    return 'issue';
  };

  let healthyNodes = 0;
  let laggingNodes = 0;
  let issueNodes = 0;

  for (const node of nodes) {
    const lag = maxHeight - node.finalizedBlockHeight;
    const health = calculateHealth(lag, node.consensusRunning);
    if (health === 'healthy') healthyNodes++;
    else if (health === 'lagging') laggingNodes++;
    else issueNodes++;
  }

  // Average peers
  const avgPeers = nodes.reduce((sum, n) => sum + n.peersCount, 0) / totalNodes;

  // Average latency (only from nodes with ping data)
  const nodesWithPing = nodes.filter(n => n.averagePing !== null && n.averagePing > 0);
  const avgLatency = nodesWithPing.length > 0
    ? nodesWithPing.reduce((sum, n) => sum + (n.averagePing ?? 0), 0) / nodesWithPing.length
    : null;

  // Max finalization lag (95th percentile approach)
  const heights = nodes.map(n => n.finalizedBlockHeight).sort((a, b) => b - a);
  const percentile95Index = Math.max(0, Math.floor(heights.length * 0.05));
  const maxFinalizationLag = maxHeight - heights[percentile95Index];

  // Consensus participation
  const consensusNodes = nodes.filter(n => n.consensusRunning);
  const consensusParticipation = (consensusNodes.length / totalNodes) * 100;

  // Calculate pulse score using raw values
  const pulseScore = calculateNetworkPulse({
    finalizationTime: maxFinalizationLag,
    latency: avgLatency ?? 50,
    consensusRunning: consensusNodes.length,
    totalNodes,
  });

  // Store network snapshot
  await db.execute(
    `INSERT INTO network_snapshots
     (timestamp, total_nodes, healthy_nodes, lagging_nodes, issue_nodes,
      avg_peers, avg_latency, max_finalization_lag, consensus_participation, pulse_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [now, totalNodes, healthyNodes, laggingNodes, issueNodes,
     avgPeers, avgLatency, maxFinalizationLag, consensusParticipation, pulseScore]
  );

  // Clean up old data (30-day rolling window)
  const cleanup = await cleanupOldData();

  // Get peer table stats
  const peerCount = await db.execute('SELECT COUNT(*) as count FROM peers');
  const peersTableCount = Number(peerCount.rows[0].count);

  // Build response
  const response = {
    success: true,
    timestamp: now,
    nodesPolled: nodes.length,
    maxHeight,
    networkMetrics: {
      totalNodes,
      healthyNodes,
      laggingNodes,
      issueNodes,
      avgPeers: Math.round(avgPeers),
      avgLatency: avgLatency ? Math.round(avgLatency) : null,
      maxFinalizationLag,
      consensusParticipation: Math.round(consensusParticipation),
      pulseScore: Math.round(pulseScore),
    },
    changes: {
      newNodes: result.newNodes.length,
      disappeared: result.disappeared.length,
      reappeared: result.reappeared.length,
      restarts: result.restarts.length,
      healthChanges: result.healthChanges.length,
      versionChanges: result.versionChanges.length,
    },
    // Peer tracking stats
    peerTracking: {
      peersTableCount,
      grpcPeersPolled: grpcPeersTotal,
      grpcErrors: grpcErrors.length > 0 ? grpcErrors : undefined,
      geoLookupsAttempted: geoStats.attempted,
      geoLookupsSucceeded: geoStats.succeeded,
      locationsInferred: inferenceStats.locationsInferred,
      bootstrappersDetected: inferenceStats.bootstrappersDetected,
    },
    // Validator tracking stats
    validatorTracking: {
      totalValidators: validatorStats.totalValidators,
      visibleValidators: validatorStats.visibleValidators,
      phantomValidators: validatorStats.phantomValidators,
      newValidators: validatorStats.newValidators,
      stakeVisibilityPct: Math.round(validatorStats.stakeVisibilityPct * 10) / 10,
      quorumHealth: validatorStats.quorumHealth,
      fetchErrors: validatorStats.fetchErrors.length > 0 ? validatorStats.fetchErrors : undefined,
    },
    snapshotsRecorded: result.snapshotsRecorded,
    cleanedUp: cleanup,
    // Timing breakdown for debugging
    timings,
  };

  // Add verbose details if requested
  if (verbose) {
    return {
      ...response,
      newNodeIds: result.newNodes,
      restartedNodeIds: result.restarts,
    };
  }

  return response;
}

/**
 * POST /api/cron/poll-nodes
 *
 * Called by Vercel Cron or external cron service to poll nodes
 * Protected by CRON_SECRET header
 */
export async function POST(request: Request) {
  // Verify cron secret if configured
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  try {
    const result = await processPollJob(true);

    if ('error' in result && result.status) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error polling nodes:', error);
    return NextResponse.json(
      {
        error: 'Failed to poll nodes',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET handler - Vercel Cron uses GET requests
 * Also serves as health check when no auth provided
 */
export async function GET(request: Request) {
  // Check if this is a Vercel Cron call (has authorization header)
  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    // This is a cron call - verify and process
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    try {
      const result = await processPollJob(false);

      if ('error' in result && result.status) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }

      return NextResponse.json(result);
    } catch (error) {
      console.error('Error polling nodes:', error);
      return NextResponse.json(
        {
          error: 'Failed to poll nodes',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  }

  // No auth - return health check info
  return NextResponse.json({
    endpoint: '/api/cron/poll-nodes',
    method: 'GET (with auth) or POST',
    description: 'Poll Concordium nodes and track changes',
    protected: !!CRON_SECRET,
  });
}
