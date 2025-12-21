import { NextResponse } from 'next/server';
import { getDbClient, initializeSchema } from '@/lib/db/client';
import { NodeTracker, type NodeSummary } from '@/lib/db/NodeTracker';
import { calculateNetworkPulse } from '@/lib/pulse';
import type { HealthStatus } from '@/lib/db/schema';

// Concordium dashboard API
const NODES_SUMMARY_URL = 'https://dashboard.mainnet.concordium.software/nodesSummary';

// Secret to protect the cron endpoint (set in Vercel env)
const CRON_SECRET = process.env.CRON_SECRET;

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
    // Initialize database (idempotent)
    await initializeSchema();
    const db = getDbClient();
    const tracker = new NodeTracker(db);

    // Fetch current nodes
    const nodes = await fetchNodesSummary();

    if (nodes.length === 0) {
      return NextResponse.json(
        { error: 'No nodes returned from API' },
        { status: 502 }
      );
    }

    // Calculate max height for health calculation
    const maxHeight = Math.max(...nodes.map(n => n.finalizedBlockHeight));

    // Process nodes and detect changes
    const result = await tracker.processNodes(nodes, maxHeight);

    // Calculate network-wide metrics
    const now = Date.now();
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

    // Return summary
    return NextResponse.json({
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
      snapshotsRecorded: result.snapshotsRecorded,
      // Include details for new nodes (for alerting)
      newNodeIds: result.newNodes,
      restartedNodeIds: result.restarts,
    });
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

    // Process the cron job (same logic as POST)
    try {
      await initializeSchema();
      const db = getDbClient();
      const tracker = new NodeTracker(db);

      const nodes = await fetchNodesSummary();

      if (nodes.length === 0) {
        return NextResponse.json(
          { error: 'No nodes returned from API' },
          { status: 502 }
        );
      }

      const maxHeight = Math.max(...nodes.map(n => n.finalizedBlockHeight));
      const result = await tracker.processNodes(nodes, maxHeight);

      // Calculate network-wide metrics
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

      await db.execute(
        `INSERT INTO network_snapshots
         (timestamp, total_nodes, healthy_nodes, lagging_nodes, issue_nodes,
          avg_peers, avg_latency, max_finalization_lag, consensus_participation, pulse_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [now, totalNodes, healthyNodes, laggingNodes, issueNodes,
         avgPeers, avgLatency, maxFinalizationLag, consensusParticipation, pulseScore]
      );

      return NextResponse.json({
        success: true,
        timestamp: now,
        nodesPolled: nodes.length,
        snapshotsRecorded: result.snapshotsRecorded,
      });
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
