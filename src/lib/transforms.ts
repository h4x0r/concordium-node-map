import type { Node, Edge } from '@xyflow/react';

// Types matching the Concordium API structure
// Note: Many numeric fields can be null from the API
export interface ConcordiumNode {
  nodeName: string;
  nodeId: string;
  peerType: string;
  client: string;
  peersCount: number;
  peersList: string[];
  averagePing: number | null;
  averageBytesPerSecondIn: number | null;
  averageBytesPerSecondOut: number | null;
  bestBlock: string;
  bestBlockHeight: number;
  finalizedBlock: string;
  finalizedBlockHeight: number;
  consensusRunning: boolean;
  bakingCommitteeMember: string;
  finalizationCommitteeMember: boolean;
  consensusBakerId: number | null;
  uptime: number;
  blockArrivePeriodEMA: number | null;
  blockReceivePeriodEMA: number | null;
  transactionsPerBlockEMA: number | null;
}

export type NodeHealth = 'healthy' | 'lagging' | 'issue';

export interface ConcordiumNodeData extends Record<string, unknown> {
  label: string;
  peersCount: number;
  health: NodeHealth;
  isBaker: boolean;
  node: ConcordiumNode;
  /** Set dynamically when a node is selected - true for its connected peers */
  isConnectedPeer?: boolean;
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
