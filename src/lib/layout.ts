import type { Node, Edge } from '@xyflow/react';
import type { ConcordiumNodeData } from './transforms';

/**
 * Number of centrality buckets for grid layout (7 columns)
 */
export const CENTRALITY_BUCKETS = 7;

/**
 * Bucket thresholds for centrality values (0.0 to 1.0)
 * Each bucket spans ~0.143 of the range
 */
const BUCKET_SIZE = 1 / CENTRALITY_BUCKETS;

/**
 * Convert a centrality value (0.0 to 1.0) to a bucket index (0 to 6)
 * Bucket 0 = lowest centrality (0.0-0.14)
 * Bucket 6 = highest centrality (0.86-1.0)
 */
export function getCentralityBucket(centrality: number | undefined): number {
  if (centrality === undefined || centrality < 0) return 0;
  if (centrality >= 1) return CENTRALITY_BUCKETS - 1;
  return Math.floor(centrality / BUCKET_SIZE);
}

/**
 * Map a centrality bucket to a visual column index.
 * Layout: highest centrality in center (column 3), lowest on right edge (column 6)
 *
 * Column mapping:
 *   Bucket 6 (highest)  -> Column 3 (center)
 *   Bucket 5            -> Column 2
 *   Bucket 4            -> Column 4
 *   Bucket 3            -> Column 1
 *   Bucket 2            -> Column 5
 *   Bucket 1            -> Column 5
 *   Bucket 0 (lowest)   -> Column 6 (right edge, for isolated nodes)
 */
export function getCentralityColumn(bucket: number): number {
  // Map buckets to columns with center = highest centrality
  const columnMap: Record<number, number> = {
    6: 3, // Highest centrality -> center
    5: 2,
    4: 4,
    3: 1,
    2: 5,
    1: 5,
    0: 6, // Lowest/isolated -> right edge
  };
  return columnMap[bucket] ?? 6;
}

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
export interface TierLabelInfo {
  tier: string;
  y: number;
  endY: number;
}

export interface LayoutResult {
  nodes: Node<ConcordiumNodeData>[];
  edges: Edge[];
  tierLabels: TierLabelInfo[];
  tierSeparators: { y: number }[];
}

export function getLayoutedElements(
  nodes: Node<ConcordiumNodeData>[],
  edges: Edge[],
  options: LayoutOptions = {}
): LayoutResult {
  const { width = 1400, height = 900 } = options;

  if (nodes.length === 0) return { nodes, edges, tierLabels: [], tierSeparators: [] };

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

  // Tier configuration: arc settings and spacing (Y positions calculated dynamically)
  // minSpacing accounts for largest possible node size + padding
  const tierConfig: Record<NodeTier, {
    arcHeight: number;
    rowSpacing: number;
    minSpacing: number;
    tierGap: number; // gap between this tier and the next
    label: string;
  }> = {
    baker: { arcHeight: 25, rowSpacing: 100, minSpacing: 100, tierGap: 60, label: 'BAKERS' },
    hub: { arcHeight: 30, rowSpacing: 80, minSpacing: 70, tierGap: 50, label: 'HUBS' },
    standard: { arcHeight: 40, rowSpacing: 50, minSpacing: 45, tierGap: 40, label: 'STANDARD' },
    edge: { arcHeight: 35, rowSpacing: 35, minSpacing: 30, tierGap: 0, label: 'EDGE' },
  };

  const layoutedNodes: Node<ConcordiumNodeData>[] = [];
  const centerX = width / 2;
  const padding = 120;
  const usableWidth = width - padding * 2;

  // Calculate tier heights first to determine dynamic Y positions
  const tierOrder: NodeTier[] = ['baker', 'hub', 'standard', 'edge'];
  const tierHeights: Record<NodeTier, number> = { baker: 0, hub: 0, standard: 0, edge: 0 };
  const tierRowCounts: Record<NodeTier, number> = { baker: 0, hub: 0, standard: 0, edge: 0 };

  for (const tier of tierOrder) {
    const count = tiers[tier].length;
    const config = tierConfig[tier];
    if (count === 0) {
      tierRowCounts[tier] = 0;
      tierHeights[tier] = 0;
    } else {
      const nodesPerRow = Math.max(1, Math.floor(usableWidth / config.minSpacing));
      const numRows = Math.ceil(count / nodesPerRow);
      tierRowCounts[tier] = numRows;
      // Height = (numRows - 1) * rowSpacing + arcHeight + buffer for node size
      tierHeights[tier] = (numRows - 1) * config.rowSpacing + config.arcHeight + 50;
    }
  }

  // Calculate dynamic Y positions for each tier
  const tierY: Record<NodeTier, number> = { baker: 0, hub: 0, standard: 0, edge: 0 };
  let currentY = 80; // Starting Y position

  for (const tier of tierOrder) {
    tierY[tier] = currentY;
    if (tiers[tier].length > 0) {
      currentY += tierHeights[tier] + tierConfig[tier].tierGap;
    }
  }

  // Position nodes in each tier
  for (const tier of tierOrder) {
    const tierNodes = tiers[tier];
    const config = tierConfig[tier];
    const count = tierNodes.length;

    if (count === 0) continue;

    const nodesPerRow = Math.max(1, Math.floor(usableWidth / config.minSpacing));
    const numRows = tierRowCounts[tier];
    const baseY = tierY[tier];

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
      const rowY = baseY + row * config.rowSpacing;

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

  // Calculate tier label positions and separator lines
  const tierLabels = tierOrder
    .filter(tier => tiers[tier].length > 0)
    .map(tier => ({
      tier: tierConfig[tier].label,
      y: tierY[tier],
      endY: tierY[tier] + tierHeights[tier],
    }));

  // Separator lines between tiers (at midpoint between tier end and next tier start)
  const tierSeparators: { y: number }[] = [];
  for (let i = 0; i < tierOrder.length - 1; i++) {
    const currentTier = tierOrder[i];
    const nextTier = tierOrder[i + 1];
    if (tiers[currentTier].length > 0 && tiers[nextTier].length > 0) {
      const separatorY = tierY[currentTier] + tierHeights[currentTier] + tierConfig[currentTier].tierGap / 2;
      tierSeparators.push({ y: separatorY });
    }
  }

  return { nodes: layoutedNodes, edges, tierLabels, tierSeparators };
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

/**
 * Column label information for grid layout
 */
export interface ColumnLabelInfo {
  column: number;
  label: string;
  x: number;
}

/**
 * Grid layout result with column labels
 */
export interface GridLayoutResult {
  nodes: Node<ConcordiumNodeData>[];
  edges: Edge[];
  tierLabels: TierLabelInfo[];
  tierSeparators: { y: number }[];
  columnLabels: ColumnLabelInfo[];
}

/**
 * Grid Layout - Centrality-based positioning
 *
 * Organizes nodes in a grid where:
 * - Y-axis (rows): Node tiers (BAKER, HUB, STANDARD, EDGE)
 * - X-axis (columns): Centrality buckets (highest in center, lowest on right)
 *
 * Nodes with the same centrality bucket are vertically aligned across tiers.
 */
/**
 * Force-Directed Tier Layout result with disconnected section
 */
export interface ForceDirectedLayoutResult {
  nodes: Node<ConcordiumNodeData>[];
  edges: Edge[];
  tierLabels: TierLabelInfo[];
  tierSeparators: { y: number }[];
  disconnectedSection?: { x: number; width: number };
}

/**
 * Force-Directed Tier Layout
 *
 * Organizes nodes in horizontal tiers with force-directed horizontal positioning:
 * - Y-axis (rows): Node tiers (BAKER, HUB, STANDARD, EDGE)
 * - X-axis: Force simulation spreads nodes horizontally
 * - Nodes with shared peers attract each other
 * - Disconnected nodes (peersCount = 0) placed in separate section on right
 */
export function getForceDirectedTierLayout(
  nodes: Node<ConcordiumNodeData>[],
  edges: Edge[],
  options: LayoutOptions = {}
): ForceDirectedLayoutResult {
  const { width = 1400, height = 900 } = options;

  if (nodes.length === 0) {
    return { nodes: [], edges: [], tierLabels: [], tierSeparators: [] };
  }

  // Separate connected and disconnected nodes
  const connectedNodes: Node<ConcordiumNodeData>[] = [];
  const disconnectedNodes: Node<ConcordiumNodeData>[] = [];

  for (const node of nodes) {
    if (node.data.peersCount === 0) {
      disconnectedNodes.push(node);
    } else {
      connectedNodes.push(node);
    }
  }

  // Canvas division: 85% main, 15% disconnected
  const mainSectionWidth = width * 0.85;
  const disconnectedSectionX = mainSectionWidth;
  const disconnectedSectionWidth = width * 0.15;

  // Classify connected nodes into tiers
  const tiers: Record<NodeTier, Node<ConcordiumNodeData>[]> = {
    baker: [],
    hub: [],
    standard: [],
    edge: [],
  };

  for (const node of connectedNodes) {
    const tier = classifyNode(node.data);
    tiers[tier].push(node);
  }

  // Sort nodes within each tier by centrality (highest first = leftmost position)
  for (const tier of Object.keys(tiers) as NodeTier[]) {
    tiers[tier].sort((a, b) => (b.data.centrality ?? 0) - (a.data.centrality ?? 0));
  }

  const tierOrder: NodeTier[] = ['baker', 'hub', 'standard', 'edge'];

  // Layout constants
  const layoutPadding = 60;
  const layoutUsableWidth = mainSectionWidth - layoutPadding * 2;
  const layoutRowSpacing = 60;

  // Tier-specific minimum spacing (larger nodes need more space)
  const tierSpacing: Record<NodeTier, number> = {
    baker: 100,
    hub: 100,
    standard: 70,
    edge: 60,
  };

  // Tier configuration - base heights (will be adjusted for row count)
  const tierConfig: Record<NodeTier, {
    baseHeight: number;
    tierGap: number;
    label: string;
  }> = {
    baker: { baseHeight: 80, tierGap: 30, label: 'BAKERS' },
    hub: { baseHeight: 80, tierGap: 30, label: 'HUBS' },
    standard: { baseHeight: 80, tierGap: 30, label: 'STANDARD' },
    edge: { baseHeight: 80, tierGap: 0, label: 'EDGE' },
  };

  // Calculate actual tier heights based on node count (multiple rows if needed)
  const tierNodesPerRow: Record<NodeTier, number> = {
    baker: Math.max(1, Math.floor(layoutUsableWidth / tierSpacing.baker)),
    hub: Math.max(1, Math.floor(layoutUsableWidth / tierSpacing.hub)),
    standard: Math.max(1, Math.floor(layoutUsableWidth / tierSpacing.standard)),
    edge: Math.max(1, Math.floor(layoutUsableWidth / tierSpacing.edge)),
  };

  const tierHeights: Record<NodeTier, number> = {
    baker: 0, hub: 0, standard: 0, edge: 0,
  };

  for (const tier of tierOrder) {
    const nodeCount = tiers[tier].length;
    if (nodeCount === 0) {
      tierHeights[tier] = 0;
    } else {
      const numRows = Math.ceil(nodeCount / tierNodesPerRow[tier]);
      tierHeights[tier] = numRows * layoutRowSpacing + 20; // Extra padding
    }
  }

  // Calculate tier Y positions
  const tierY: Record<NodeTier, number> = { baker: 0, hub: 0, standard: 0, edge: 0 };
  let currentY = 60;

  for (const tier of tierOrder) {
    tierY[tier] = currentY;
    if (tiers[tier].length > 0) {
      currentY += tierHeights[tier] + tierConfig[tier].tierGap;
    }
  }

  // Build shared peers lookup for attraction force
  const nodeIdSet = new Set(nodes.map(n => n.id));
  const nodePeers: Map<string, Set<string>> = new Map();

  for (const node of nodes) {
    const peers = new Set<string>();
    for (const peerId of node.data.node.peersList) {
      if (nodeIdSet.has(peerId)) {
        peers.add(peerId);
      }
    }
    nodePeers.set(node.id, peers);
  }

  // Even distribution with multiple rows if needed
  const layoutedNodes: Node<ConcordiumNodeData>[] = [];

  for (const tier of tierOrder) {
    const tierNodes = tiers[tier];
    if (tierNodes.length === 0) continue;

    const baseY = tierY[tier];
    const nodeCount = tierNodes.length;
    const nodesPerRow = tierNodesPerRow[tier];
    const nodeSpacing = tierSpacing[tier];

    tierNodes.forEach((node, index) => {
      const row = Math.floor(index / nodesPerRow);
      const indexInRow = index % nodesPerRow;
      const nodesInThisRow = Math.min(nodesPerRow, nodeCount - row * nodesPerRow);

      // Calculate spacing for this row
      const rowWidth = nodesInThisRow * nodeSpacing;
      const startX = layoutPadding + (layoutUsableWidth - rowWidth) / 2; // Center the row

      // Position within row
      const x = startX + indexInRow * nodeSpacing + nodeSpacing / 2;
      const y = baseY + row * layoutRowSpacing + 30; // 30px offset from tier top

      // Small jitter for visual interest
      const jitterX = ((hashCode(node.id) % 12) - 6);
      const jitterY = ((hashCode(node.id + 'y') % 12) - 6);

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

  // Position disconnected nodes in a grid on the right
  if (disconnectedNodes.length > 0) {
    const discPadding = 20;
    const discUsableWidth = disconnectedSectionWidth - discPadding * 2;
    const nodesPerRow = Math.max(1, Math.floor(discUsableWidth / 40));

    disconnectedNodes.forEach((node, index) => {
      const row = Math.floor(index / nodesPerRow);
      const col = index % nodesPerRow;

      const x = disconnectedSectionX + discPadding + (col + 0.5) * (discUsableWidth / nodesPerRow);
      const y = 80 + row * 35;

      layoutedNodes.push({
        ...node,
        position: { x, y },
        data: {
          ...node.data,
          tier: 'edge' as NodeTier,
        },
      });
    });
  }

  // Generate tier labels (only for connected tiers)
  const tierLabels = tierOrder
    .filter(tier => tiers[tier].length > 0)
    .map(tier => ({
      tier: tierConfig[tier].label,
      y: tierY[tier],
      endY: tierY[tier] + tierHeights[tier],
    }));

  // Generate tier separators
  const tierSeparators: { y: number }[] = [];
  for (let i = 0; i < tierOrder.length - 1; i++) {
    const currentTier = tierOrder[i];
    const nextTier = tierOrder[i + 1];
    if (tiers[currentTier].length > 0 && tiers[nextTier].length > 0) {
      const separatorY = tierY[currentTier] + tierHeights[currentTier] + tierConfig[currentTier].tierGap / 2;
      tierSeparators.push({ y: separatorY });
    }
  }

  return {
    nodes: layoutedNodes,
    edges,
    tierLabels,
    tierSeparators,
    disconnectedSection: disconnectedNodes.length > 0
      ? { x: disconnectedSectionX, width: disconnectedSectionWidth }
      : undefined,
  };
}

export function getGridLayoutedElements(
  nodes: Node<ConcordiumNodeData>[],
  edges: Edge[],
  options: LayoutOptions = {}
): GridLayoutResult {
  const { width = 1400 } = options;

  if (nodes.length === 0) {
    return { nodes: [], edges: [], tierLabels: [], tierSeparators: [], columnLabels: [] };
  }

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

  // Sort nodes within each tier by centrality (highest first)
  for (const tier of Object.keys(tiers) as NodeTier[]) {
    tiers[tier].sort((a, b) => (b.data.centrality ?? 0) - (a.data.centrality ?? 0));
  }

  const tierOrder: NodeTier[] = ['baker', 'hub', 'standard', 'edge'];

  // Tier configuration
  const tierConfig: Record<NodeTier, {
    rowHeight: number;
    tierGap: number;
    label: string;
  }> = {
    baker: { rowHeight: 120, tierGap: 40, label: 'BAKERS' },
    hub: { rowHeight: 100, tierGap: 35, label: 'HUBS' },
    standard: { rowHeight: 80, tierGap: 30, label: 'STANDARD' },
    edge: { rowHeight: 60, tierGap: 0, label: 'EDGE' },
  };

  // Calculate column positions
  const padding = 100;
  const usableWidth = width - padding * 2;
  const columnWidth = usableWidth / CENTRALITY_BUCKETS;

  // Calculate column X positions (column 3 = center)
  const columnX: number[] = [];
  for (let i = 0; i < CENTRALITY_BUCKETS; i++) {
    columnX[i] = padding + i * columnWidth + columnWidth / 2;
  }

  // Calculate tier Y positions
  const tierY: Record<NodeTier, number> = { baker: 0, hub: 0, standard: 0, edge: 0 };
  let currentY = 100;

  for (const tier of tierOrder) {
    tierY[tier] = currentY;
    if (tiers[tier].length > 0) {
      currentY += tierConfig[tier].rowHeight + tierConfig[tier].tierGap;
    }
  }

  // Position nodes in grid cells
  const layoutedNodes: Node<ConcordiumNodeData>[] = [];

  // Track nodes per cell for stacking
  const cellCounts: Record<string, number> = {};

  for (const tier of tierOrder) {
    const tierNodes = tiers[tier];
    const baseY = tierY[tier];
    const rowHeight = tierConfig[tier].rowHeight;

    for (const node of tierNodes) {
      const bucket = getCentralityBucket(node.data.centrality);
      const column = getCentralityColumn(bucket);
      const cellKey = `${tier}-${column}`;

      // Get stacking offset for this cell
      const stackIndex = cellCounts[cellKey] ?? 0;
      cellCounts[cellKey] = stackIndex + 1;

      // Calculate position
      const x = columnX[column];
      const y = baseY + rowHeight / 2 + stackIndex * 25; // Stack vertically within cell

      // Add small jitter for visual interest
      const jitterX = ((hashCode(node.id) % 12) - 6);
      const jitterY = ((hashCode(node.id + 'y') % 6) - 3);

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
    }
  }

  // Generate tier labels
  const tierLabels = tierOrder
    .filter(tier => tiers[tier].length > 0)
    .map(tier => ({
      tier: tierConfig[tier].label,
      y: tierY[tier],
      endY: tierY[tier] + tierConfig[tier].rowHeight,
    }));

  // Generate tier separators
  const tierSeparators: { y: number }[] = [];
  for (let i = 0; i < tierOrder.length - 1; i++) {
    const currentTier = tierOrder[i];
    const nextTier = tierOrder[i + 1];
    if (tiers[currentTier].length > 0 && tiers[nextTier].length > 0) {
      const separatorY = tierY[currentTier] + tierConfig[currentTier].rowHeight + tierConfig[currentTier].tierGap / 2;
      tierSeparators.push({ y: separatorY });
    }
  }

  // Generate column labels
  const columnLabels: ColumnLabelInfo[] = [
    { column: 0, label: 'LOW', x: columnX[0] },
    { column: 1, label: '0.14-0.28', x: columnX[1] },
    { column: 2, label: '0.57-0.71', x: columnX[2] },
    { column: 3, label: 'HIGH', x: columnX[3] },
    { column: 4, label: '0.42-0.57', x: columnX[4] },
    { column: 5, label: '0.28-0.42', x: columnX[5] },
    { column: 6, label: 'LOW/ISOLATED', x: columnX[6] },
  ];

  return { nodes: layoutedNodes, edges, tierLabels, tierSeparators, columnLabels };
}
