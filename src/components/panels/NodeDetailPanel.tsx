'use client';

import { useAppStore } from '@/hooks/useAppStore';
import { useNodes } from '@/hooks/useNodes';
import { calculateNodeHealth, type ConcordiumNode } from '@/lib/transforms';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { X, ChevronDown, Wifi, Server, Blocks, Gauge, Shield } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

function formatUptime(ms: number): string {
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return 'N/A';
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatNumber(value: number | null, decimals: number = 0, suffix: string = ''): string {
  if (value === null || value === undefined) return 'N/A';
  return `${value.toFixed(decimals)}${suffix}`;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, icon, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm font-medium hover:text-foreground text-muted-foreground">
        {icon}
        {title}
        <ChevronDown
          className={cn('h-4 w-4 ml-auto transition-transform', open && 'rotate-180')}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function NodeDetails({ node, maxHeight }: { node: ConcordiumNode; maxHeight: number }) {
  const health = calculateNodeHealth(node, maxHeight);
  const selectNode = useAppStore((s) => s.selectNode);

  const healthColor = {
    healthy: 'bg-green-500',
    lagging: 'bg-yellow-500',
    issue: 'bg-red-500',
  }[health];

  const isBaker =
    node.bakingCommitteeMember === 'ActiveInCommittee' && node.consensusBakerId !== null;

  return (
    <div className="space-y-2">
      <Section title="Overview" icon={<Server className="h-4 w-4" />}>
        <DetailRow label="Client" value={node.client} />
        <DetailRow label="Peer Type" value={node.peerType} />
        <DetailRow label="Uptime" value={formatUptime(node.uptime)} />
        <DetailRow
          label="Status"
          value={
            <div className="flex items-center gap-2">
              <div className={cn('h-2 w-2 rounded-full', healthColor)} />
              {health}
            </div>
          }
        />
        <DetailRow
          label="Consensus"
          value={node.consensusRunning ? 'Running' : 'Stopped'}
        />
      </Section>

      <Section title="Connectivity" icon={<Wifi className="h-4 w-4" />}>
        <DetailRow label="Peers" value={node.peersCount} />
        <DetailRow label="Avg Ping" value={formatNumber(node.averagePing, 0, 'ms')} />
        <DetailRow label="Bandwidth In" value={formatBytes(node.averageBytesPerSecondIn)} />
        <DetailRow label="Bandwidth Out" value={formatBytes(node.averageBytesPerSecondOut)} />
        {node.peersList.length > 0 && (
          <div className="mt-2">
            <div className="text-xs text-muted-foreground mb-1">Connected Peers ({node.peersList.length})</div>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              {node.peersList.map((peerId) => (
                <Badge
                  key={peerId}
                  variant="secondary"
                  className="cursor-pointer text-xs"
                  onClick={() => selectNode(peerId)}
                >
                  {peerId.slice(0, 8)}...
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Blockchain State" icon={<Blocks className="h-4 w-4" />}>
        <DetailRow label="Best Block" value={node.bestBlockHeight.toLocaleString()} />
        <DetailRow label="Finalized" value={node.finalizedBlockHeight.toLocaleString()} />
        <DetailRow
          label="Behind"
          value={`${maxHeight - node.finalizedBlockHeight} blocks`}
        />
        <DetailRow label="Best Block Hash" value={`${node.bestBlock.slice(0, 12)}...`} />
      </Section>

      <Section title="Performance" icon={<Gauge className="h-4 w-4" />} defaultOpen={false}>
        <DetailRow
          label="Block Arrive Period"
          value={formatNumber(node.blockArrivePeriodEMA, 2, 's')}
        />
        <DetailRow
          label="Block Receive Period"
          value={formatNumber(node.blockReceivePeriodEMA, 2, 's')}
        />
        <DetailRow
          label="Tx per Block"
          value={formatNumber(node.transactionsPerBlockEMA, 2)}
        />
      </Section>

      {isBaker && (
        <Section title="Baker Info" icon={<Shield className="h-4 w-4" />}>
          <DetailRow label="Baker ID" value={node.consensusBakerId} />
          <DetailRow label="Committee Status" value={node.bakingCommitteeMember} />
          <DetailRow
            label="Finalization"
            value={node.finalizationCommitteeMember ? 'Active' : 'Inactive'}
          />
        </Section>
      )}
    </div>
  );
}

export function NodeDetailPanel() {
  const { selectedNodeId, isPanelOpen, closePanel } = useAppStore();
  const { data: nodes } = useNodes();

  const { selectedNode, maxHeight } = useMemo(() => {
    if (!nodes || !selectedNodeId) return { selectedNode: null, maxHeight: 0 };
    const node = nodes.find((n) => n.nodeId === selectedNodeId);
    const max = Math.max(...nodes.map((n) => n.finalizedBlockHeight));
    return { selectedNode: node, maxHeight: max };
  }, [nodes, selectedNodeId]);

  if (!isPanelOpen || !selectedNode) return null;

  const health = calculateNodeHealth(selectedNode, maxHeight);
  const isBaker =
    selectedNode.bakingCommitteeMember === 'ActiveInCommittee' &&
    selectedNode.consensusBakerId !== null;

  return (
    <Card className="fixed right-0 top-0 bottom-20 w-80 lg:w-96 border-l rounded-none bg-background/95 backdrop-blur z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b flex items-start justify-between">
        <div>
          <h2 className="font-semibold text-lg truncate pr-2">{selectedNode.nodeName}</h2>
          <div className="flex gap-2 mt-1">
            <Badge
              variant={health === 'healthy' ? 'default' : health === 'lagging' ? 'secondary' : 'destructive'}
            >
              {health}
            </Badge>
            {isBaker && <Badge variant="outline">Baker</Badge>}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={closePanel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        <NodeDetails node={selectedNode} maxHeight={maxHeight} />
      </ScrollArea>
    </Card>
  );
}
