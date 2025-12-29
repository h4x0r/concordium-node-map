'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useOnViewportChange,
  type Node,
  type Edge,
  type NodeProps,
  type Viewport,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useNodes } from '@/hooks/useNodes';
import { useAppStore } from '@/hooks/useAppStore';
import { useAudio } from '@/hooks/useAudio';
import { toReactFlowNodes, toReactFlowEdges, type ConcordiumNodeData, type ConcordiumNode } from '@/lib/transforms';
import { getForceDirectedTierLayout, type TierLabelInfo, type ForceDirectedLayoutResult } from '@/lib/layout';
import {
  buildAdjacencyList,
  identifyBottlenecks,
  identifyBridges,
  calculateBetweennessCentrality,
  type GraphNode,
  type GraphEdge,
} from '@/lib/topology-analysis';
import { cn } from '@/lib/utils';
import { calculateEdgeWeight, getEdgeStrokeWidth, type EdgeWeightData } from '@/lib/edge-weights';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HUDReticle, type NodeHealth, type NodeTier } from './HUDReticle';
import { TopologyAnalysisBar } from '@/components/dashboard/TopologyAnalysisPanel';
import { NodeFilterPanel } from './NodeFilterPanel';
import { useNodeFilter } from '@/hooks/useNodeFilter';
import { filterNodes, type FilterableNode } from '@/lib/node-filters';

function ConcordiumNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ConcordiumNodeData;
  const isConnectedPeer = nodeData.isConnectedPeer;
  const isCritical = nodeData.isCritical;
  const tier = nodeData.tier || 'standard';

  // Health colors - consistent across all tiers
  const healthColors = {
    healthy: {
      bg: 'bg-emerald-500',
      border: 'border-emerald-400',
      glow: 'shadow-[0_0_12px_rgba(52,211,153,0.5)]',
    },
    lagging: {
      bg: 'bg-amber-500',
      border: 'border-amber-400',
      glow: 'shadow-[0_0_12px_rgba(251,191,36,0.5)]',
    },
    issue: {
      bg: 'bg-red-500',
      border: 'border-red-400',
      glow: 'shadow-[0_0_12px_rgba(248,113,113,0.5)]',
    },
  }[nodeData.health];

  // Tier-based sizing: Bakers largest, Edge smallest
  const tierSizes = {
    baker: { base: 40, max: 70 },    // Largest - critical infrastructure
    hub: { base: 25, max: 50 },      // Large - network backbone
    standard: { base: 14, max: 30 }, // Medium - regular nodes
    edge: { base: 8, max: 18 },      // Small - peripheral
  };

  const tierSize = tierSizes[tier];
  const peerScale = Math.min(nodeData.peersCount / 20, 1);
  const size = Math.round(tierSize.base + (tierSize.max - tierSize.base) * peerScale);

  // Tier-specific styling
  const tierStyles = {
    baker: 'ring-2 ring-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.4)]',
    hub: 'ring-1 ring-[var(--bb-cyan)]/30',
    standard: '',
    edge: 'opacity-80',
  };

  // Selected node is MUCH larger and has distinct styling
  const selectedSize = selected ? Math.max(size * 1.4, 35) : size;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative">
            {/* Iron Man HUD Targeting Reticle */}
            <HUDReticle
              health={nodeData.health as NodeHealth}
              tier={tier as NodeTier}
              selected={selected}
              isConnectedPeer={isConnectedPeer}
            />
            <div
              className={cn(
                'rounded-full border-2 flex items-center justify-center cursor-pointer transition-all duration-300',
                healthColors.bg,
                healthColors.border,
                healthColors.glow,
                tierStyles[tier],
                selected && 'border-[#00CCFF] shadow-[0_0_20px_rgba(0,204,255,0.6)]'
              )}
              style={{ width: selectedSize, height: selectedSize }}
            >
              <Handle type="target" position={Position.Top} className="opacity-0" />
              <Handle type="source" position={Position.Bottom} className="opacity-0" />
              {nodeData.isBaker && (
                <div
                  className="validator-badge"
                  title="Validator (Baker)"
                />
              )}
              {isCritical && (
                <div
                  className="critical-star"
                  title="Critical node (network bottleneck)"
                />
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs bg-[var(--bb-black)] border border-[var(--bb-orange)] p-2 z-50"
        >
          <div className="space-y-1">
            <div className="font-mono font-bold text-[var(--bb-orange)]">
              {nodeData.node.nodeName || 'Unnamed Node'}
            </div>
            <div className="font-mono text-[10px] text-[var(--bb-gray)]">
              {nodeData.node.nodeId}
            </div>
            <div className="flex gap-2 flex-wrap pt-1">
              <span className={cn(
                'text-[10px] font-mono px-1',
                tier === 'baker' && 'text-purple-400 bg-purple-500/20',
                tier === 'hub' && 'text-[var(--bb-cyan)]',
                tier === 'standard' && 'text-[var(--bb-gray)]',
                tier === 'edge' && 'text-[var(--bb-gray)] opacity-70'
              )}>
                {tier.toUpperCase()}
              </span>
              <span className="text-[10px] font-mono text-[var(--bb-cyan)]">
                {nodeData.peersCount} PEERS
              </span>
              <span className={cn(
                'text-[10px] font-mono',
                nodeData.health === 'healthy' && 'text-[var(--bb-green)]',
                nodeData.health === 'lagging' && 'text-[var(--bb-amber)]',
                nodeData.health === 'issue' && 'text-[var(--bb-red)]'
              )}>
                {nodeData.health.toUpperCase()}
              </span>
              {isCritical && (
                <span className="text-[10px] font-mono px-1 text-amber-400 bg-amber-500/20">
                  CRITICAL
                </span>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const nodeTypes = {
  concordiumNode: ConcordiumNodeComponent,
};

// Tier colors for labels and separators - high visibility
const TIER_COLORS: Record<string, { color: string; opacity: number; separatorOpacity: number }> = {
  'BAKERS': { color: 'rgb(168, 85, 247)', opacity: 1, separatorOpacity: 0.4 },
  'HUBS': { color: 'var(--bb-cyan)', opacity: 0.9, separatorOpacity: 0.3 },
  'STANDARD': { color: 'var(--bb-green)', opacity: 0.8, separatorOpacity: 0.25 },
  'EDGE': { color: 'var(--bb-amber)', opacity: 0.7, separatorOpacity: 0.2 },
};

interface TierLabelsProps {
  tierLabels: TierLabelInfo[];
  tierSeparators: { y: number }[];
  disconnectedSection?: { x: number; width: number };
}

/**
 * Renders tier labels and disconnected section marker that follow the viewport zoom/pan
 * Must be rendered inside ReactFlowProvider context
 */
function TierLabels({ tierLabels, tierSeparators, disconnectedSection }: TierLabelsProps) {
  const { getViewport } = useReactFlow();
  const [viewport, setViewport] = useState<Viewport>(getViewport());

  // Subscribe to viewport changes for smooth updates during zoom/pan
  useOnViewportChange({
    onChange: (newViewport) => setViewport(newViewport),
  });

  // Scale font size inversely with zoom to keep labels readable
  const fontSize = Math.max(8, Math.min(12, 10 / viewport.zoom));

  return (
    <div
      className="absolute inset-0 overflow-visible"
      style={{
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        transformOrigin: '0 0',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {/* Centrality Spectrum Header */}
      <div
        className="absolute font-mono"
        style={{
          left: 60,
          top: 25,
          width: disconnectedSection ? disconnectedSection.x - 80 : 1100,
          fontSize: `${Math.max(10, fontSize + 1)}px`,
          pointerEvents: 'none',
        }}
      >
        <div className="flex justify-between items-center">
          <span style={{ color: 'var(--bb-cyan)', opacity: 0.9, fontWeight: 'bold' }}>◀ HIGH</span>
          <span style={{ color: 'var(--bb-gray)', opacity: 0.6 }}>BETWEENNESS CENTRALITY</span>
          <span style={{ color: 'var(--bb-amber)', opacity: 0.9, fontWeight: 'bold' }}>LOW ▶</span>
        </div>
        <div
          style={{
            height: 3,
            marginTop: 6,
            background: 'linear-gradient(90deg, var(--bb-cyan), var(--bb-gray) 50%, var(--bb-amber))',
            opacity: 0.5,
            borderRadius: 2,
          }}
        />
      </div>

      {/* Disconnected Section Separator and Label */}
      {disconnectedSection && (
        <>
          {/* Vertical separator line */}
          <div
            className="absolute"
            style={{
              left: disconnectedSection.x - 10,
              top: 40,
              width: 2,
              height: 600,
              background: 'linear-gradient(to bottom, var(--bb-red), transparent)',
              opacity: 0.4,
              pointerEvents: 'none',
            }}
          />
          {/* Disconnected section label */}
          <div
            className="absolute font-mono font-bold tracking-wider"
            style={{
              left: disconnectedSection.x + 10,
              top: 50,
              color: 'var(--bb-red)',
              opacity: 0.6,
              fontSize: `${fontSize}px`,
              pointerEvents: 'none',
            }}
          >
            DISCONNECTED
          </div>
        </>
      )}

      {/* Tier Labels - positioned in graph coordinates */}
      {tierLabels.map(({ tier, y }) => {
        const colors = TIER_COLORS[tier] || TIER_COLORS['STANDARD'];
        return (
          <div
            key={tier}
            className="absolute font-mono font-black tracking-widest"
            style={{
              left: 10,
              top: y + 5,
              color: colors.color,
              opacity: colors.opacity,
              fontSize: `${Math.max(11, fontSize + 2)}px`,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              textShadow: '0 0 10px currentColor, 0 0 20px currentColor',
              background: 'linear-gradient(90deg, rgba(0,0,0,0.6) 0%, transparent 100%)',
              padding: '2px 8px 2px 4px',
              borderLeft: `3px solid ${colors.color}`,
            }}
          >
            {tier}
          </div>
        );
      })}

      {/* Tier Separator Lines - positioned in graph coordinates */}
      {tierSeparators.map(({ y }, i) => {
        // Use color from the tier above the separator
        const tierAbove = tierLabels[i];
        const colors = tierAbove ? (TIER_COLORS[tierAbove.tier] || TIER_COLORS['STANDARD']) : TIER_COLORS['STANDARD'];
        return (
          <div
            key={i}
            className="absolute h-px"
            style={{
              left: -60,
              top: y,
              width: disconnectedSection ? disconnectedSection.x - 20 : 2000,
              background: `linear-gradient(to right, ${colors.color}, transparent)`,
              opacity: colors.separatorOpacity,
              pointerEvents: 'none',
            }}
          />
        );
      })}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-center space-y-6">
        {/* Animated loading ring */}
        <div className="relative w-20 h-20 mx-auto">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--concordium-teal)]/20" />
          <div className="absolute inset-0 rounded-full border-2 border-[var(--concordium-teal)] border-t-transparent animate-spin" />
          <div className="absolute inset-2 rounded-full border border-[var(--concordium-teal)]/30" />
          <div className="absolute inset-4 rounded-full bg-[var(--concordium-teal)]/10 animate-pulse" />
        </div>

        {/* Loading text with typing effect */}
        <div className="space-y-2">
          <p className="text-muted-foreground font-mono text-sm tracking-wider">
            LOADING NETWORK TOPOLOGY<span className="cursor-blink" />
          </p>
          <div className="flex justify-center gap-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton
                key={i}
                className="w-3 h-3 rounded-full bg-[var(--concordium-teal)]/20"
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface TopologyGraphProps {
  onNodeSelect?: (nodeId: string | null) => void;
}

export function TopologyGraph({ onNodeSelect }: TopologyGraphProps = {}) {
  const { data: apiNodes, isLoading } = useNodes();
  const { selectedNodeId, selectNode } = useAppStore();
  const { playAcquisitionSequence, isMuted, toggleMute } = useAudio();
  const filterCriteria = useNodeFilter();

  // Compute which node IDs pass the current filter
  const filteredNodeIds = useMemo(() => {
    if (!apiNodes) return new Set<string>();
    if (filterCriteria.tiers.length === 0 && filterCriteria.health.length === 0) {
      // No filters active - all nodes pass
      return new Set(apiNodes.map((n) => n.nodeId));
    }

    // Build filterable node list from initial nodes (which have tier/health)
    const maxHeight = Math.max(...apiNodes.map((node) => node.finalizedBlockHeight ?? 0));
    const filterableNodes: FilterableNode[] = apiNodes.map((n) => {
      const health = !n.consensusRunning
        ? 'issue'
        : maxHeight - (n.finalizedBlockHeight ?? 0) > 2
          ? 'lagging'
          : 'healthy';
      // Check baker status like transforms.ts does
      const isBaker = n.bakingCommitteeMember === 'ActiveInCommittee' && n.consensusBakerId !== null;
      const tier = isBaker
        ? 'baker'
        : n.peersCount >= 10
          ? 'hub'
          : n.peersCount >= 3
            ? 'standard'
            : 'edge';
      return { id: n.nodeId, tier: tier as NodeTier, health: health as NodeHealth };
    });

    const filtered = filterNodes(filterableNodes, filterCriteria);
    return new Set(filtered.map((n) => n.id));
  }, [apiNodes, filterCriteria.tiers, filterCriteria.health]);

  const { initialNodes, initialEdges, tierLabels, tierSeparators, disconnectedSection, criticalNodeIds, bridgeEdgeKeys } = useMemo(() => {
    if (!apiNodes) return { initialNodes: [], initialEdges: [], tierLabels: [], tierSeparators: [], disconnectedSection: undefined, criticalNodeIds: new Set<string>(), bridgeEdgeKeys: new Set<string>() };

    const rawNodes = toReactFlowNodes(apiNodes);
    const rawEdges = toReactFlowEdges(apiNodes);

    // Compute topology analysis for visual indicators
    const graphNodes: GraphNode[] = apiNodes.map((n) => ({ id: n.nodeId }));
    const graphEdges: GraphEdge[] = [];
    const nodeIds = new Set(apiNodes.map((n) => n.nodeId));

    for (const node of apiNodes) {
      for (const peerId of node.peersList) {
        if (nodeIds.has(peerId)) {
          const [a, b] = [node.nodeId, peerId].sort();
          const edgeId = `${a}-${b}`;
          if (!graphEdges.some((e) => `${e.source}-${e.target}` === edgeId)) {
            graphEdges.push({ source: a, target: b });
          }
        }
      }
    }

    const adj = buildAdjacencyList(graphNodes, graphEdges);
    const bottlenecks = identifyBottlenecks(adj, 5); // Top 5 critical nodes
    const bridges = identifyBridges(adj);

    // Calculate betweenness centrality for positioning nodes on spectrum
    const centralityMap = calculateBetweennessCentrality(adj);

    // Inject centrality into node data
    const nodesWithCentrality = rawNodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        centrality: centralityMap.get(node.id) ?? 0,
      },
    }));

    // Create sets for fast lookup
    const criticalIds = new Set(bottlenecks);
    const bridgeKeys = new Set(bridges.map(([a, b]) => {
      const [src, tgt] = [a, b].sort();
      return `${src}-${tgt}`;
    }));

    // Apply force-directed tier layout with centrality-based X positioning
    const { nodes: layoutedNodes, edges: layoutedEdges, tierLabels: labels, tierSeparators: separators, disconnectedSection: discSection } = getForceDirectedTierLayout(
      nodesWithCentrality,
      rawEdges,
      { width: 1400, height: 900 }
    );

    return {
      initialNodes: layoutedNodes,
      initialEdges: layoutedEdges,
      tierLabels: labels,
      tierSeparators: separators,
      disconnectedSection: discSection,
      criticalNodeIds: criticalIds,
      bridgeEdgeKeys: bridgeKeys,
    };
  }, [apiNodes]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Get peer IDs for selected node
  const selectedPeerIds = useMemo(() => {
    if (!selectedNodeId || !apiNodes) return new Set<string>();
    const selectedNode = apiNodes.find((n: ConcordiumNode) => n.nodeId === selectedNodeId);
    return new Set(selectedNode?.peersList || []);
  }, [selectedNodeId, apiNodes]);

  // Create map of nodeId to EdgeWeightData for edge visualization
  const nodeWeightData = useMemo(() => {
    if (!apiNodes) return new Map<string, EdgeWeightData>();
    const map = new Map<string, EdgeWeightData>();
    for (const node of apiNodes) {
      const bandwidth = (node.averageBytesPerSecondIn ?? 0) + (node.averageBytesPerSecondOut ?? 0);
      map.set(node.nodeId, {
        averagePing: node.averagePing,
        bandwidth: bandwidth > 0 ? bandwidth : null,
      });
    }
    return map;
  }, [apiNodes]);

  // Update nodes and edges when data changes
  useEffect(() => {
    if (initialNodes.length > 0) {
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Play JARVIS acquisition sequence
      playAcquisitionSequence();

      if (onNodeSelect) {
        onNodeSelect(node.id);
      } else {
        selectNode(node.id);
      }
    },
    [selectNode, onNodeSelect, playAcquisitionSequence]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    onNodeSelect?.(null);
  }, [selectNode, onNodeSelect]);

  // Style edges - cyberpunk aesthetic with teal highlights and energy animation
  // Edge thickness based on connection bandwidth/latency
  const styledEdges = useMemo((): Edge[] => {
    return edges.map((edge: Edge) => {
      const isConnectedToSelected = Boolean(
        selectedNodeId &&
        (edge.source === selectedNodeId || edge.target === selectedNodeId)
      );

      // Check if this is a bridge edge (single point of failure)
      const [src, tgt] = [edge.source, edge.target].sort();
      const isBridge = bridgeEdgeKeys.has(`${src}-${tgt}`);

      // Calculate edge weight from source and target node data
      const sourceData = nodeWeightData.get(edge.source) ?? { averagePing: null, bandwidth: null };
      const targetData = nodeWeightData.get(edge.target) ?? { averagePing: null, bandwidth: null };
      const edgeWeight = calculateEdgeWeight(sourceData, targetData);
      const strokeWidth = getEdgeStrokeWidth(edgeWeight.bandwidth);

      // For connected edges, let CSS handle styling via energy-active class
      // For bridge edges, use red dashed stroke
      // For non-connected edges, apply inline styles with bandwidth-based width
      return {
        ...edge,
        className: isConnectedToSelected ? 'energy-active' : (isBridge ? 'bridge-edge' : ''),
        style: isConnectedToSelected
          ? { opacity: 1, strokeWidth: Math.max(strokeWidth, 2) }  // CSS animation + weight
          : isBridge
            ? {
                stroke: 'rgba(255, 68, 68, 0.7)',
                strokeWidth: Math.max(strokeWidth, 2),
                strokeDasharray: '5,3',
                opacity: selectedNodeId ? 0.3 : 0.8,
              }
            : {
                stroke: 'rgba(100, 116, 139, 0.5)',
                strokeWidth,
                opacity: selectedNodeId ? 0.15 : 0.5,
              },
        animated: false,
        // Reduce interaction width to minimize cursor capture area
        // Active edges get slightly larger hit area, inactive edges minimal
        interactionWidth: isConnectedToSelected ? 10 : 1,
      };
    });
  }, [edges, selectedNodeId, bridgeEdgeKeys, nodeWeightData]);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="w-full h-full relative">
      {/* Topology Analysis Bar - overlays top of canvas */}
      <TopologyAnalysisBar />
      <ReactFlow
        nodes={nodes.map((n) => {
          const passesFilter = filteredNodeIds.has(n.id);

          // Calculate opacity based on filter and selection states
          let opacity = 1;
          if (!passesFilter) {
            // Filtered out - very dim
            opacity = 0.08;
          } else if (selectedNodeId) {
            opacity = n.id === selectedNodeId || selectedPeerIds.has(n.id) ? 1 : 0.2;
          }

          return {
            ...n,
            selected: n.id === selectedNodeId,
            data: {
              ...n.data,
              isConnectedPeer: !!(selectedNodeId && selectedPeerIds.has(n.id) && n.id !== selectedNodeId),
              isCritical: criticalNodeIds.has(n.id),
            },
            style: {
              opacity,
              transition: 'opacity 0.3s ease',
              // Disable interaction for filtered-out nodes
              pointerEvents: passesFilter ? 'auto' : 'none',
            },
          };
        })}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          style: { stroke: 'rgba(100, 116, 139, 0.5)', strokeWidth: 1, opacity: 0.5 },
        }}
      >
        <Background
          color="var(--concordium-teal)"
          gap={40}
          size={1}
          style={{ opacity: 0.03 }}
        />
        <Controls
          showInteractive={false}
          className="!bg-[var(--bb-panel)] !border-[var(--bb-border)] [&>button]:!bg-[var(--bb-black)] [&>button]:!border-[var(--bb-border)] [&>button]:!text-[var(--bb-gray)] [&>button:hover]:!bg-[var(--bb-orange)] [&>button:hover]:!text-[var(--bb-black)]"
          style={{ bottom: 20, left: 20 }}
        />
        {/* JARVIS Audio Mute Toggle - positioned directly below Controls */}
        <button
          onClick={toggleMute}
          className="absolute z-10 w-[26px] h-[26px] flex items-center justify-center text-sm transition-opacity hover:opacity-80"
          style={{
            bottom: 5,
            left: 35,
            opacity: isMuted ? 0.4 : 1,
          }}
          title={isMuted ? 'Enable JARVIS sounds' : 'Mute JARVIS sounds'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
        <TierLabels tierLabels={tierLabels} tierSeparators={tierSeparators} disconnectedSection={disconnectedSection} />
        <NodeFilterPanel />
      </ReactFlow>
    </div>
  );
}
