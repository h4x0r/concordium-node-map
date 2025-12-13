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
  const healthColor = {
    healthy: 'bg-green-500 border-green-600',
    lagging: 'bg-yellow-500 border-yellow-600',
    issue: 'bg-red-500 border-red-600',
  }[nodeData.health];

  // Dynamic size based on peer count (min 8px, max 120px) - very dramatic scaling
  const baseSize = 8;
  const maxSize = 120;
  const scaleFactor = Math.min(nodeData.peersCount / 10, 1); // Normalize to 0-1 (10 peers = max)
  const size = Math.round(baseSize + (maxSize - baseSize) * scaleFactor); // Linear for maximum drama

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'rounded-full border-2 flex items-center justify-center cursor-pointer transition-all',
              healthColor,
              selected && 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background'
            )}
            style={{ width: size, height: size }}
          >
            <Handle type="target" position={Position.Top} className="opacity-0" />
            <Handle type="source" position={Position.Bottom} className="opacity-0" />
            {nodeData.isBaker && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full border border-background" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <div className="font-medium">{nodeData.label}</div>
            <div className="text-xs text-muted-foreground flex gap-2">
              <Badge variant="outline" className="text-xs">
                {nodeData.peersCount} peers
              </Badge>
              <Badge
                variant={nodeData.health === 'healthy' ? 'default' : nodeData.health === 'lagging' ? 'secondary' : 'destructive'}
                className="text-xs"
              >
                {nodeData.health}
              </Badge>
              {nodeData.isBaker && (
                <Badge variant="outline" className="text-xs bg-purple-500/10">
                  Baker
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
    <div className="w-full h-full flex items-center justify-center bg-muted/20">
      <div className="text-center space-y-4">
        <div className="flex justify-center gap-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="w-8 h-8 rounded-full" />
          ))}
        </div>
        <p className="text-muted-foreground text-sm">Loading network topology...</p>
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

  // Style edges - always visible, highlight those connected to selected node
  const styledEdges = useMemo((): Edge[] => {
    return edges.map((edge: Edge) => {
      const isConnectedToSelected = Boolean(
        selectedNodeId &&
        (edge.source === selectedNodeId || edge.target === selectedNodeId)
      );

      return {
        ...edge,
        style: {
          stroke: isConnectedToSelected ? '#3b82f6' : '#64748b',
          strokeWidth: isConnectedToSelected ? 2.5 : 1.5,
          opacity: selectedNodeId ? (isConnectedToSelected ? 1 : 0.2) : 0.7,
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
                : 0.3
              : 1,
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
          style: { stroke: '#64748b', strokeWidth: 1.5, opacity: 0.7 },
        }}
      >
        <Background color="hsl(var(--muted-foreground))" gap={20} size={1} />
        <Controls
          className="!bg-zinc-900 !border-zinc-700 !rounded-lg [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-300 [&>button:hover]:!bg-zinc-700"
          style={{ bottom: 20, left: 20 }}
        />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as ConcordiumNodeData;
            return data.health === 'healthy'
              ? '#22c55e'
              : data.health === 'lagging'
                ? '#eab308'
                : '#ef4444';
          }}
          maskColor="rgba(0, 0, 0, 0.8)"
          className="!bg-zinc-900 !border-zinc-700 !rounded-lg"
          style={{ bottom: 20, right: 20 }}
        />
      </ReactFlow>
    </div>
  );
}
