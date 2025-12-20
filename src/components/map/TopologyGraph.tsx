'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
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

  // Cyberpunk color scheme with glows
  const healthColors = {
    healthy: {
      bg: 'bg-emerald-500',
      border: 'border-emerald-400',
      glow: 'shadow-[0_0_15px_rgba(52,211,153,0.5)]',
    },
    lagging: {
      bg: 'bg-amber-500',
      border: 'border-amber-400',
      glow: 'shadow-[0_0_15px_rgba(251,191,36,0.5)]',
    },
    issue: {
      bg: 'bg-red-500',
      border: 'border-red-400',
      glow: 'shadow-[0_0_15px_rgba(248,113,113,0.5)]',
    },
  }[nodeData.health];

  // Dynamic size based on peer count (min 8px, max 120px) - very dramatic scaling
  const baseSize = 8;
  const maxSize = 120;
  const scaleFactor = Math.min(nodeData.peersCount / 10, 1);
  const size = Math.round(baseSize + (maxSize - baseSize) * scaleFactor);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'rounded-full border-2 flex items-center justify-center cursor-pointer transition-all duration-300',
              healthColors.bg,
              healthColors.border,
              healthColors.glow,
              selected && 'ring-2 ring-[var(--concordium-teal)] ring-offset-2 ring-offset-background shadow-[0_0_25px_var(--concordium-teal-glow)]'
            )}
            style={{ width: size, height: size }}
          >
            <Handle type="target" position={Position.Top} className="opacity-0" />
            <Handle type="source" position={Position.Bottom} className="opacity-0" />
            {nodeData.isBaker && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full border border-background shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs bg-background/95 backdrop-blur-md border-[var(--concordium-teal)]/30 shadow-[0_0_20px_var(--concordium-teal-dim)]"
        >
          <div className="space-y-2 p-1">
            <div className="font-mono font-bold text-[var(--concordium-teal)]">{nodeData.label}</div>
            <div className="flex gap-2 flex-wrap">
              <Badge
                variant="outline"
                className="text-[10px] font-mono bg-card/50"
              >
                {nodeData.peersCount} PEERS
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] font-mono',
                  nodeData.health === 'healthy' && 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
                  nodeData.health === 'lagging' && 'bg-amber-500/20 text-amber-400 border-amber-500/50',
                  nodeData.health === 'issue' && 'bg-red-500/20 text-red-400 border-red-500/50'
                )}
              >
                {nodeData.health.toUpperCase()}
              </Badge>
              {nodeData.isBaker && (
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono bg-purple-500/20 text-purple-400 border-purple-500/50"
                >
                  BAKER
                </Badge>
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

export function TopologyGraph() {
  const { data: apiNodes, isLoading } = useNodes();
  const { selectedNodeId, selectNode } = useAppStore();

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!apiNodes) return { initialNodes: [], initialEdges: [] };

    const rawNodes = toReactFlowNodes(apiNodes);
    const rawEdges = toReactFlowEdges(apiNodes);

    // Apply force-directed layout to minimize edge crossings
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      rawNodes,
      rawEdges,
      { width: 1400, height: 900, iterations: 400 }
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
      selectNode(node.id);
    },
    [selectNode]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

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
          className="!bg-background/90 !backdrop-blur-md !border-[var(--concordium-teal)]/30 !rounded-lg [&>button]:!bg-card/50 [&>button]:!border-[var(--concordium-teal)]/20 [&>button]:!text-foreground [&>button:hover]:!bg-[var(--concordium-teal)]/20 [&>button:hover]:!text-[var(--concordium-teal)]"
          style={{ bottom: 20, left: 20 }}
        />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as ConcordiumNodeData;
            return data.health === 'healthy'
              ? '#34d399'
              : data.health === 'lagging'
                ? '#fbbf24'
                : '#f87171';
          }}
          maskColor="rgba(0, 0, 0, 0.85)"
          className="!bg-background/90 !backdrop-blur-md !border-[var(--concordium-teal)]/30 !rounded-lg"
          style={{ bottom: 20, right: 20 }}
        />
      </ReactFlow>
    </div>
  );
}
