import { NextResponse } from 'next/server';
import { getDbClient, initializeSchema, cleanupOldData } from '@/lib/db/client';
import { NodeTracker, type NodeSummary } from '@/lib/db/NodeTracker';
import { ValidatorTracker } from '@/lib/db/ValidatorTracker';
import { calculateNetworkPulse } from '@/lib/pulse';
import type { HealthStatus } from '@/lib/db/schema';

// Allow longer execution time (if on Pro plan)
export const maxDuration = 60;

// Concordium dashboard API
const NODES_SUMMARY_URL = 'https://dashboard.mainnet.concordium.software/nodesSummary';

// Secret to protect the cron endpoint
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Fetch nodes from the Concordium dashboard API
 */
async function fetchNodesSummary(): Promise<NodeSummary[]> {
  const response = await fetch(NODES_SUMMARY_URL, {
    headers: { 'Accept': 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch nodes: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

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
    // Validator linkage - links reporting nodes to on-chain bakers
    consensusBakerId: node.consensusBakerId as number | undefined,
    bakingCommitteeMember: node.bakingCommitteeMember as string | undefined,
  }));
}

/**
 * Simplified poll job - NO gRPC calls
 * Only fetches from dashboard API and calculates metrics
 */
async function processPollJobSimple() {
  const timings: Record<string, number> = {};
  const startTime = Date.now();

  // Initialize database
  await initializeSchema();
  const db = getDbClient();
  const tracker = new NodeTracker(db);
  timings['init'] = Date.now() - startTime;

  // Fetch nodes from dashboard API
  const fetchStart = Date.now();
  const nodes = await fetchNodesSummary();
  timings['fetchNodes'] = Date.now() - fetchStart;

  if (nodes.length === 0) {
    return { error: 'No nodes returned from API', status: 502 };
  }

  // Calculate max height
  const maxHeight = Math.max(...nodes.map(n => n.finalizedBlockHeight));

  // Process nodes
  const processStart = Date.now();
  const result = await tracker.processNodes(nodes, maxHeight);
  timings['processNodes'] = Date.now() - processStart;

  // Update validator visibility from nodes with baker IDs
  // This links reporting nodes to validators without needing gRPC
  const validatorStart = Date.now();
  const validatorTracker = new ValidatorTracker(db);
  const reportingPeers = nodes
    .filter((n) => n.consensusBakerId !== undefined)
    .map((n) => ({
      peerId: n.nodeId,
      consensusBakerId: n.consensusBakerId ?? null,
      nodeName: n.nodeName,
    }));
  const validatorUpdate = await validatorTracker.updateVisibilityFromNodes(reportingPeers);
  timings['validatorUpdate'] = Date.now() - validatorStart;

  // Calculate metrics
  const now = Date.now();
  const totalNodes = nodes.length;

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

  const avgPeers = nodes.reduce((sum, n) => sum + n.peersCount, 0) / totalNodes;
  const nodesWithPing = nodes.filter(n => n.averagePing !== null && n.averagePing > 0);
  const avgLatency = nodesWithPing.length > 0
    ? nodesWithPing.reduce((sum, n) => sum + (n.averagePing ?? 0), 0) / nodesWithPing.length
    : null;

  const heights = nodes.map(n => n.finalizedBlockHeight).sort((a, b) => b - a);
  const percentile95Index = Math.max(0, Math.floor(heights.length * 0.05));
  const maxFinalizationLag = maxHeight - heights[percentile95Index];

  const consensusNodes = nodes.filter(n => n.consensusRunning);
  const consensusParticipation = (consensusNodes.length / totalNodes) * 100;

  const pulseScore = calculateNetworkPulse({
    finalizationTime: maxFinalizationLag,
    latency: avgLatency ?? 50,
    consensusRunning: consensusNodes.length,
    totalNodes,
  });

  // Store snapshot
  const snapshotStart = Date.now();
  await db.execute(
    `INSERT INTO network_snapshots
     (timestamp, total_nodes, healthy_nodes, lagging_nodes, issue_nodes,
      avg_peers, avg_latency, max_finalization_lag, consensus_participation, pulse_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [now, totalNodes, healthyNodes, laggingNodes, issueNodes,
     avgPeers, avgLatency, maxFinalizationLag, consensusParticipation, pulseScore]
  );
  timings['snapshot'] = Date.now() - snapshotStart;

  // Cleanup
  const cleanupStart = Date.now();
  const cleanup = await cleanupOldData();
  timings['cleanup'] = Date.now() - cleanupStart;

  timings['total'] = Date.now() - startTime;

  return {
    success: true,
    mode: 'simple',
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
    validatorVisibility: {
      nodesWithBakerId: reportingPeers.length,
      validatorsUpdated: validatorUpdate.updated,
      alreadyVisible: validatorUpdate.alreadyVisible,
      noMatchingValidator: validatorUpdate.noValidator,
    },
    note: 'gRPC operations skipped (validator fetch, peer fetch) but baker linkage from dashboard API processed',
    snapshotsRecorded: result.snapshotsRecorded,
    cleanedUp: cleanup,
    timings,
  };
}

/**
 * GET /api/cron/poll-nodes-simple
 * Fast version without gRPC calls
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const result = await processPollJobSimple();
      if ('error' in result && result.status) {
        return NextResponse.json({ error: result.error }, { status: result.status });
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

  return NextResponse.json({
    endpoint: '/api/cron/poll-nodes-simple',
    method: 'GET (with auth)',
    description: 'Simple poll - dashboard data only, NO gRPC',
    protected: !!CRON_SECRET,
  });
}
