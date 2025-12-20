import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import type { Node, Edge } from '@xyflow/react';

interface SimNode extends SimulationNodeDatum {
  id: string;
  width: number;
  height: number;
  degree: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

export interface LayoutOptions {
  width?: number;
  height?: number;
  iterations?: number;
}

/**
 * Apply hierarchical layout algorithm based on node degree
 * Nodes with fewer connections appear at the top, more connections at the bottom
 * Uses d3-force with:
 * - Y force: positions nodes vertically by degree (low degree = top, high degree = bottom)
 * - X force: centers nodes horizontally
 * - Link force: keeps connected nodes at optimal distance
 * - Many-body force: nodes repel each other for horizontal spreading
 * - Collision force: prevents node overlap
 */
export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  const { width = 2400, height = 1600, iterations = 300 } = options;

  if (nodes.length === 0) return { nodes, edges };

  // Calculate degree (number of edges) for each node
  const degreeMap = new Map<string, number>();
  for (const node of nodes) {
    degreeMap.set(node.id, 0);
  }
  for (const edge of edges) {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
    degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
  }

  // Find min and max degree for normalization
  const degrees = Array.from(degreeMap.values());
  const minDegree = Math.min(...degrees);
  const maxDegree = Math.max(...degrees);
  const degreeRange = maxDegree - minDegree || 1;

  // Create simulation nodes with degree info
  const simNodes: SimNode[] = nodes.map((node) => {
    const degree = degreeMap.get(node.id) || 0;
    // Normalize degree to 0-1, then map to Y position
    // Low degree = top (small Y), high degree = bottom (large Y)
    const normalizedDegree = (degree - minDegree) / degreeRange;
    const targetY = 50 + normalizedDegree * (height - 100);

    return {
      id: node.id,
      x: width / 2 + (Math.random() - 0.5) * width * 0.8,
      y: targetY,
      width: 50,
      height: 50,
      degree,
    };
  });

  // Create simulation links
  const simLinks: SimLink[] = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
  }));

  // Create force simulation with hierarchical Y positioning
  const simulation = forceSimulation<SimNode>(simNodes)
    // Y force - position nodes by degree (strongest force for hierarchy)
    .force(
      'y',
      forceY<SimNode>((d) => {
        const normalizedDegree = (d.degree - minDegree) / degreeRange;
        return 50 + normalizedDegree * (height - 100);
      }).strength(2.0)
    )
    // X force - center horizontally
    .force(
      'x',
      forceX<SimNode>(width / 2).strength(0.05)
    )
    // Link force - connected nodes attract (very weak to not override Y positioning)
    .force(
      'link',
      forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance(120)
        .strength(0.05)
    )
    // Many-body force - strong repulsion for horizontal spreading within tiers
    .force(
      'charge',
      forceManyBody<SimNode>()
        .strength(-1200)
        .distanceMax(500)
    )
    // Collision force - prevent overlap
    .force(
      'collide',
      forceCollide<SimNode>()
        .radius(60)
        .strength(1.0)
    )
    .stop();

  // Run simulation synchronously
  for (let i = 0; i < iterations; i++) {
    simulation.tick();
  }

  // Apply positions back to nodes
  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
  const layoutedNodes = nodes.map((node) => {
    const simNode = nodeMap.get(node.id);
    return {
      ...node,
      position: {
        x: simNode?.x ?? node.position.x,
        y: simNode?.y ?? node.position.y,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
