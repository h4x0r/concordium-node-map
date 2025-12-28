import type { Node, Edge } from '@xyflow/react';

// Types matching the Concordium API structure
// Note: Many numeric fields can be null from the API
export interface ConcordiumNode {
  // Node identity
  nodeName: string;
  nodeId: string;
  peerType: string;
  client: string;
  uptime: number;
  genesisBlock: string;

  // Network connectivity
  peersCount: number;
  peersList: string[];
  averagePing: number | null;

  // Bandwidth (rates)
  averageBytesPerSecondIn: number | null;
  averageBytesPerSecondOut: number | null;

  // Packet counts (totals)
  packetsSent: number;
  packetsReceived: number;

  // Best block info
  bestBlock: string;
  bestBlockHeight: number;
  bestBlockBakerId: number | null;
  bestArrivedTime: string | null;
  bestBlockTransactionCount: number;
  bestBlockTransactionsSize: number;
  bestBlockTransactionEnergyCost: number;
  bestBlockExecutionCost: number | null;
  bestBlockTotalAmount: number;
  bestBlockTotalEncryptedAmount: number;
  bestBlockCentralBankAmount: number;

  // Block arrival timing stats
  blockArrivePeriodEMA: number | null;
  blockArrivePeriodEMSD: number | null;
  blockArriveLatencyEMA: number | null;
  blockArriveLatencyEMSD: number | null;

  // Block receive timing stats
  blockReceivePeriodEMA: number | null;
  blockReceivePeriodEMSD: number | null;
  blockReceiveLatencyEMA: number | null;
  blockReceiveLatencyEMSD: number | null;

  // Block counts
  blocksReceivedCount: number;
  blocksVerifiedCount: number;

  // Finalized block info
  finalizedBlock: string;
  finalizedBlockHeight: number;
  finalizedBlockParent: string;
  finalizedTime: string | null;

  // Finalization timing stats
  finalizationPeriodEMA: number | null;
  finalizationPeriodEMSD: number | null;
  finalizationCount: number;

  // Consensus & baking
  consensusRunning: boolean;
  bakingCommitteeMember: string;
  finalizationCommitteeMember: boolean;
  consensusBakerId: number | null;

  // Transaction stats
  transactionsPerBlockEMA: number | null;
  transactionsPerBlockEMSD: number | null;
}

export type NodeHealth = 'healthy' | 'lagging' | 'issue';

export type NodeTier = 'baker' | 'hub' | 'standard' | 'edge';

export interface ConcordiumNodeData extends Record<string, unknown> {
  label: string;
  peersCount: number;
  health: NodeHealth;
  isBaker: boolean;
  node: ConcordiumNode;
  /** Set dynamically when a node is selected - true for its connected peers */
  isConnectedPeer?: boolean;
  /** Node tier for layout - set by layout algorithm */
  tier?: NodeTier;
  /** True if this node is a network bottleneck (high betweenness centrality) */
  isCritical?: boolean;
}

export function calculateNodeHealth(node: ConcordiumNode, maxHeight: number): NodeHealth {
  if (!node.consensusRunning) {
    return 'issue';
  }
  if (maxHeight - node.finalizedBlockHeight > 2) {
    return 'lagging';
  }
  return 'healthy';
}

export function toReactFlowNodes(nodes: ConcordiumNode[]): Node<ConcordiumNodeData>[] {
  if (nodes.length === 0) return [];

  const maxHeight = Math.max(...nodes.map((n) => n.finalizedBlockHeight));

  return nodes.map((node, index) => {
    const isBaker =
      node.bakingCommitteeMember === 'ActiveInCommittee' && node.consensusBakerId !== null;

    // Simple grid layout - will be replaced by force-directed layout
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const row = Math.floor(index / cols);
    const col = index % cols;

    return {
      id: node.nodeId,
      type: 'concordiumNode',
      position: { x: col * 150, y: row * 150 },
      data: {
        label: node.nodeName || node.nodeId.slice(0, 12),
        peersCount: node.peersCount,
        health: calculateNodeHealth(node, maxHeight),
        isBaker,
        node,
      },
    };
  });
}

export function toReactFlowEdges(nodes: ConcordiumNode[]): Edge[] {
  if (nodes.length === 0) return [];

  const nodeIds = new Set(nodes.map((n) => n.nodeId));
  const edgeSet = new Set<string>();
  const edges: Edge[] = [];

  for (const node of nodes) {
    for (const peerId of node.peersList) {
      // Only create edge if peer exists in our node list
      if (!nodeIds.has(peerId)) continue;

      // Create canonical edge ID (sorted to deduplicate bidirectional)
      const [a, b] = [node.nodeId, peerId].sort();
      const edgeId = `${a}-${b}`;

      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: a,
          target: b,
        });
      }
    }
  }

  return edges;
}
