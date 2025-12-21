'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useNodes } from '@/hooks/useNodes';
import { useAppStore } from '@/hooks/useAppStore';
import { toReactFlowNodes, toReactFlowEdges, type ConcordiumNodeData, type ConcordiumNode } from '@/lib/transforms';
import { getLayoutedElements } from '@/lib/layout';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

function ConcordiumNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ConcordiumNodeData;
  const isConnectedPeer = nodeData.isConnectedPeer;
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
            {/* Selected node indicator - pulsing orange ring */}
            {selected && (
              <>
                <div
                  className="absolute rounded-full border-4 border-[var(--bb-orange)] animate-ping"
                  style={{
                    width: selectedSize + 20,
                    height: selectedSize + 20,
                    top: -10,
                    left: -10,
                    opacity: 0.75,
                  }}
                />
                <div
                  className="absolute rounded-full border-2 border-[var(--bb-orange)]"
                  style={{
                    width: selectedSize + 12,
                    height: selectedSize + 12,
                    top: -6,
                    left: -6,
                  }}
                />
              </>
            )}
            {/* Connected peer indicator - subtle cyan ring */}
            {isConnectedPeer && !selected && (
              <div
                className="absolute rounded-full border-2 border-[var(--bb-cyan)]"
                style={{
                  width: size + 8,
                  height: size + 8,
                  top: -4,
                  left: -4,
                }}
              />
            )}
            <div
              className={cn(
                'rounded-full border-2 flex items-center justify-center cursor-pointer transition-all duration-300',
                healthColors.bg,
                healthColors.border,
                healthColors.glow,
                tierStyles[tier],
                selected && 'border-[var(--bb-orange)] shadow-[0_0_30px_rgba(255,102,0,0.8)]',
                isConnectedPeer && !selected && 'shadow-[0_0_20px_rgba(0,204,255,0.5)]'
              )}
              style={{ width: selectedSize, height: selectedSize }}
            >
              <Handle type="target" position={Position.Top} className="opacity-0" />
              <Handle type="source" position={Position.Bottom} className="opacity-0" />
              {nodeData.isBaker && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full border border-background shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
              )}
            </div>
            {/* Selected node label */}
            {selected && (
              <div
                className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-[var(--bb-orange)] bg-[var(--bb-black)] px-2 py-0.5 border border-[var(--bb-orange)]"
                style={{ top: selectedSize + 8 }}
              >
                ▶ SELECTED
              </div>
            )}
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

// Tier label positions in graph coordinates (from layout.ts tierConfig)
const TIER_LABELS = [
  { tier: 'BAKERS', y: 80, color: 'rgb(168, 85, 247)', opacity: 0.6 },
  { tier: 'HUBS', y: 280, color: 'var(--bb-cyan)', opacity: 0.4 },
  { tier: 'STANDARD', y: 500, color: 'var(--bb-gray)', opacity: 0.3 },
  { tier: 'EDGE', y: 750, color: 'var(--bb-gray)', opacity: 0.2 },
] as const;

// Tier separator line positions (between tiers)
const TIER_SEPARATORS = [
  { y: 200, color: 'rgb(168, 85, 247)', opacity: 0.2 },
  { y: 420, color: 'var(--bb-cyan)', opacity: 0.15 },
  { y: 650, color: 'var(--bb-gray)', opacity: 0.1 },
] as const;

/**
 * Renders tier labels that follow the viewport zoom/pan
 * Must be rendered inside ReactFlowProvider context
 */
function TierLabels() {
  const { getViewport } = useReactFlow();
  const viewport = getViewport();

  // Scale font size inversely with zoom to keep labels readable
  const fontSize = Math.max(8, Math.min(12, 10 / viewport.zoom));

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        transformOrigin: '0 0',
      }}
    >
      {/* Tier Labels - positioned in graph coordinates */}
      {TIER_LABELS.map(({ tier, y, color, opacity }) => (
        <div
          key={tier}
          className="absolute font-mono font-bold tracking-widest"
          style={{
            left: -60,
            top: y - 5,
            color,
            opacity,
            fontSize: `${fontSize}px`,
            whiteSpace: 'nowrap',
          }}
        >
          {tier}
        </div>
      ))}

      {/* Tier Separator Lines - positioned in graph coordinates */}
      {TIER_SEPARATORS.map(({ y, color, opacity }, i) => (
        <div
          key={i}
          className="absolute h-px"
          style={{
            left: -60,
            top: y,
            width: 2000,
            background: `linear-gradient(to right, ${color}, transparent)`,
            opacity,
          }}
        />
      ))}
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

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!apiNodes) return { initialNodes: [], initialEdges: [] };

    const rawNodes = toReactFlowNodes(apiNodes);
    const rawEdges = toReactFlowEdges(apiNodes);

    // Apply tiered "Mission Control" layout
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      rawNodes,
      rawEdges,
      { width: 1400, height: 900 }
    );

    return {
      initialNodes: layoutedNodes,
      initialEdges: layoutedEdges,
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

  // Update nodes and edges when data changes
  useEffect(() => {
    if (initialNodes.length > 0) {
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (onNodeSelect) {
        onNodeSelect(node.id);
      } else {
        selectNode(node.id);
      }
    },
    [selectNode, onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    onNodeSelect?.(null);
  }, [selectNode, onNodeSelect]);

  // Style edges - cyberpunk aesthetic with teal highlights
  const styledEdges = useMemo((): Edge[] => {
    return edges.map((edge: Edge) => {
      const isConnectedToSelected = Boolean(
        selectedNodeId &&
        (edge.source === selectedNodeId || edge.target === selectedNodeId)
      );

      return {
        ...edge,
        style: {
          stroke: isConnectedToSelected ? 'var(--concordium-teal)' : 'rgba(100, 116, 139, 0.5)',
          strokeWidth: isConnectedToSelected ? 2.5 : 1,
          opacity: selectedNodeId ? (isConnectedToSelected ? 1 : 0.15) : 0.5,
          filter: isConnectedToSelected ? 'drop-shadow(0 0 3px var(--concordium-teal-glow))' : 'none',
        },
        animated: isConnectedToSelected,
      };
    });
  }, [edges, selectedNodeId]);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes.map((n) => ({
          ...n,
          selected: n.id === selectedNodeId,
          data: {
            ...n.data,
            isConnectedPeer: !!(selectedNodeId && selectedPeerIds.has(n.id) && n.id !== selectedNodeId),
          },
          style: {
            opacity: selectedNodeId
              ? n.id === selectedNodeId || selectedPeerIds.has(n.id)
                ? 1
                : 0.2
              : 1,
            transition: 'opacity 0.3s ease',
          },
        }))}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        minZoom={0.1}
        maxZoom={2}
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
        <TierLabels />
      </ReactFlow>
    </div>
  );
}
