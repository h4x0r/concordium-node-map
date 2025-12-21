import type { Node, Edge } from '@xyflow/react';
import type { ConcordiumNodeData } from './transforms';

export interface LayoutOptions {
  width?: number;
  height?: number;
}

/**
 * Node tier classification for hierarchical layout
 */
type NodeTier = 'baker' | 'hub' | 'standard' | 'edge';

function classifyNode(data: ConcordiumNodeData): NodeTier {
  // Bakers are most important - consensus participants
  if (data.isBaker) return 'baker';

  // Hubs have high connectivity (>15 peers)
  if (data.peersCount >= 15) return 'hub';

  // Standard nodes have moderate connectivity (5-15 peers)
  if (data.peersCount >= 5) return 'standard';

  // Edge nodes have low connectivity (<5 peers)
  return 'edge';
}

/**
 * Calculate estimated node size based on tier and peer count
 * Mirrors the sizing logic in TopologyGraph.tsx
 */
function estimateNodeSize(tier: NodeTier, peersCount: number): number {
  const tierSizes = {
    baker: { base: 40, max: 70 },
    hub: { base: 25, max: 50 },
    standard: { base: 14, max: 30 },
    edge: { base: 8, max: 18 },
  };

  const tierSize = tierSizes[tier];
  const peerScale = Math.min(peersCount / 20, 1);
  return tierSize.base + (tierSize.max - tierSize.base) * peerScale;
}

/**
 * Tiered Arc Layout - "Mission Control" style
 *
 * Organizes nodes into horizontal tiers based on importance:
 * - BAKERS: Top center, largest, most prominent
 * - HUBS: Below bakers, high-connectivity nodes
 * - STANDARD: Middle tier, regular full nodes
 * - EDGE: Bottom, low-connectivity peripheral nodes
 *
 * Within each tier, nodes are distributed in an arc pattern
 * with slight vertical variance for visual interest.
 * Large tiers automatically use multiple rows to prevent overlap.
 */
export function getLayoutedElements(
  nodes: Node<ConcordiumNodeData>[],
  edges: Edge[],
  options: LayoutOptions = {}
): { nodes: Node<ConcordiumNodeData>[]; edges: Edge[] } {
  const { width = 1400, height = 900 } = options;

  if (nodes.length === 0) return { nodes, edges };

  // Classify nodes into tiers
  const tiers: Record<NodeTier, Node<ConcordiumNodeData>[]> = {
    baker: [],
    hub: [],
    standard: [],
    edge: [],
  };

  for (const node of nodes) {
    const tier = classifyNode(node.data);
    tiers[tier].push(node);
  }

  // Sort nodes within each tier by peer count (highest first for prominence)
  for (const tier of Object.keys(tiers) as NodeTier[]) {
    tiers[tier].sort((a, b) => b.data.peersCount - a.data.peersCount);
  }

  // Tier configuration: Y position, arc settings, and spacing
  // minSpacing accounts for largest possible node size + padding
  const tierConfig: Record<NodeTier, {
    y: number;
    arcHeight: number;
    rowSpacing: number;
    minSpacing: number;
    label: string;
  }> = {
    baker: { y: 80, arcHeight: 25, rowSpacing: 100, minSpacing: 100, label: 'BAKERS' },
    hub: { y: 280, arcHeight: 30, rowSpacing: 80, minSpacing: 70, label: 'HUBS' },
    standard: { y: 500, arcHeight: 40, rowSpacing: 50, minSpacing: 45, label: 'STANDARD' },
    edge: { y: 750, arcHeight: 35, rowSpacing: 35, minSpacing: 30, label: 'EDGE' },
  };

  const layoutedNodes: Node<ConcordiumNodeData>[] = [];
  const centerX = width / 2;
  const padding = 120;
  const usableWidth = width - padding * 2;

  // Position nodes in each tier
  for (const tier of Object.keys(tiers) as NodeTier[]) {
    const tierNodes = tiers[tier];
    const config = tierConfig[tier];
    const count = tierNodes.length;

    if (count === 0) continue;

    // Calculate how many nodes can fit per row based on minimum spacing
    const nodesPerRow = Math.max(1, Math.floor(usableWidth / config.minSpacing));
    const numRows = Math.ceil(count / nodesPerRow);

    tierNodes.forEach((node, index) => {
      // Determine which row this node belongs to
      const row = Math.floor(index / nodesPerRow);
      const indexInRow = index % nodesPerRow;
      const nodesInThisRow = Math.min(nodesPerRow, count - row * nodesPerRow);

      // Calculate horizontal spread for this row
      // Use more spread for rows with fewer nodes
      const rowSpread = Math.min(usableWidth, nodesInThisRow * config.minSpacing);
      const startX = centerX - rowSpread / 2;

      // Horizontal position: evenly distributed across row width
      const progress = nodesInThisRow === 1 ? 0.5 : indexInRow / (nodesInThisRow - 1);
      const x = startX + progress * rowSpread;

      // Vertical position: base Y + row offset + arc curve
      const rowY = config.y + row * config.rowSpacing;

      // Arc curve (parabola centered at middle) - flatter for multi-row layouts
      const arcProgress = (progress - 0.5) * 2; // -1 to 1
      const arcMultiplier = numRows > 1 ? 0.5 : 1; // Reduce arc for multi-row
      const arcOffset = config.arcHeight * arcMultiplier * (1 - arcProgress * arcProgress);
      const y = rowY + arcOffset;

      // Add small random jitter for organic feel (but consistent per node)
      const jitterX = ((hashCode(node.id) % 16) - 8);
      const jitterY = ((hashCode(node.id + 'y') % 8) - 4);

      layoutedNodes.push({
        ...node,
        position: {
          x: x + jitterX,
          y: y + jitterY,
        },
        data: {
          ...node.data,
          tier,
        },
      });
    });
  }

  return { nodes: layoutedNodes, edges };
}

/**
 * Simple string hash for consistent jitter
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
