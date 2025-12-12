'use client';

import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useNodes } from '@/hooks/useNodes';
import { useAppStore } from '@/hooks/useAppStore';
import { toReactFlowNodes, toReactFlowEdges, type ConcordiumNodeData } from '@/lib/transforms';
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

  const sizeClass = nodeData.peersCount > 15 ? 'w-12 h-12' : nodeData.peersCount > 8 ? 'w-10 h-10' : 'w-8 h-8';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'rounded-full border-2 flex items-center justify-center cursor-pointer transition-all',
              healthColor,
              sizeClass,
              selected && 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background'
            )}
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
    return {
      initialNodes: toReactFlowNodes(apiNodes),
      initialEdges: toReactFlowEdges(apiNodes),
    };
  }, [apiNodes]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when data changes
  useMemo(() => {
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

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes.map((n) => ({
          ...n,
          selected: n.id === selectedNodeId,
        }))}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          style: { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, opacity: 0.3 },
        }}
      >
        <Background color="hsl(var(--muted-foreground))" gap={20} size={1} />
        <Controls className="bg-background border border-border rounded-lg" />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as ConcordiumNodeData;
            return data.health === 'healthy'
              ? '#22c55e'
              : data.health === 'lagging'
                ? '#eab308'
                : '#ef4444';
          }}
          className="bg-background border border-border rounded-lg"
        />
      </ReactFlow>
    </div>
  );
}
