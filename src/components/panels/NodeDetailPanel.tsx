'use client';

import { useAppStore } from '@/hooks/useAppStore';
import { useNodes } from '@/hooks/useNodes';
import { usePeers } from '@/hooks/usePeers';
import { calculateNodeHealth, type ConcordiumNode } from '@/lib/transforms';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { X, ChevronRight, Wifi, Server, Blocks, Gauge, Shield, Globe } from 'lucide-react';
import { PeerTypeBadge, type PeerSource } from '@/components/ui/PeerTypeBadge';
import type { PeerData } from '@/hooks/usePeers';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatUptime, formatBytesPerSecond, formatNumber, formatBlockHeight } from '@/lib/formatting';

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
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2.5 text-xs font-mono tracking-wider uppercase hover:text-[var(--concordium-teal)] text-muted-foreground transition-colors group">
        <ChevronRight
          className={cn(
            'h-3 w-3 transition-transform text-[var(--concordium-teal)]/50 group-hover:text-[var(--concordium-teal)]',
            open && 'rotate-90'
          )}
        />
        <span className="text-[var(--concordium-teal)]/70">{icon}</span>
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-4 pl-5 border-l border-[var(--concordium-teal)]/20 ml-1.5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between gap-2 py-1.5 text-sm font-mono border-b border-border/30 last:border-0">
      <span className="text-muted-foreground text-xs shrink-0">{label}</span>
      <span className="font-medium text-foreground text-right break-all min-w-0">{value}</span>
    </div>
  );
}

function NodeDetails({ node, maxHeight, peerData }: { node: ConcordiumNode; maxHeight: number; peerData?: PeerData }) {
  const health = calculateNodeHealth(node, maxHeight);
  const selectNode = useAppStore((s) => s.selectNode);

  const healthStyles = {
    healthy: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
    lagging: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
    issue: 'bg-red-500/20 text-red-400 border-red-500/50',
  }[health];

  const healthDot = {
    healthy: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
    lagging: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
    issue: 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]',
  }[health];

  const isBaker =
    node.bakingCommitteeMember === 'ActiveInCommittee' && node.consensusBakerId !== null;

  return (
    <div className="space-y-1">
      <Section title="Overview" icon={<Server className="h-3.5 w-3.5" />}>
        <DetailRow label="Client" value={node.client} />
        <DetailRow label="Peer Type" value={node.peerType} />
        <DetailRow label="Uptime" value={formatUptime(node.uptime)} />
        <DetailRow
          label="Status"
          value={
            <div className="flex items-center gap-2">
              <div className={cn('h-2 w-2 rounded-full', healthDot)} />
              <span className="uppercase text-xs">{health}</span>
            </div>
          }
        />
        <DetailRow
          label="Consensus"
          value={
            <span className={node.consensusRunning ? 'text-emerald-400' : 'text-red-400'}>
              {node.consensusRunning ? 'RUNNING' : 'STOPPED'}
            </span>
          }
        />
      </Section>

      <Section title="Connectivity" icon={<Wifi className="h-3.5 w-3.5" />}>
        {peerData?.ipAddress && (
          <DetailRow
            label="IP Address"
            value={
              <span className="text-[var(--concordium-teal)]">{peerData.ipAddress}</span>
            }
          />
        )}
        {peerData?.port && (
          <DetailRow label="Port" value={peerData.port} />
        )}
        <DetailRow label="Peers" value={node.peersCount} />
        <DetailRow label="Avg Ping" value={formatNumber(node.averagePing, 0, 'ms')} />
        <DetailRow label="Bandwidth In" value={formatBytesPerSecond(node.averageBytesPerSecondIn)} />
        <DetailRow label="Bandwidth Out" value={formatBytesPerSecond(node.averageBytesPerSecondOut)} />
        {node.peersList.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] font-mono text-muted-foreground mb-2 tracking-wider">
              CONNECTED PEERS ({node.peersList.length})
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {node.peersList.map((peerId) => (
                <Badge
                  key={peerId}
                  variant="outline"
                  className="cursor-pointer text-[10px] font-mono bg-card/50 hover:bg-[var(--concordium-teal)]/20 hover:border-[var(--concordium-teal)]/50 hover:text-[var(--concordium-teal)] transition-all"
                  onClick={() => selectNode(peerId)}
                >
                  {peerId.slice(0, 8)}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Blockchain State" icon={<Blocks className="h-3.5 w-3.5" />}>
        <DetailRow
          label="Best Block"
          value={
            <span className="text-[var(--concordium-teal)]">
              {formatBlockHeight(node.bestBlockHeight)}
            </span>
          }
        />
        <DetailRow
          label="Finalized"
          value={formatBlockHeight(node.finalizedBlockHeight)}
        />
        <DetailRow
          label="Behind"
          value={
            <span className={maxHeight - node.finalizedBlockHeight > 10 ? 'text-amber-400' : ''}>
              {maxHeight - node.finalizedBlockHeight} blocks
            </span>
          }
        />
        <DetailRow
          label="Best Block Hash"
          value={
            <span className="text-xs opacity-70">{node.bestBlock.slice(0, 16)}...</span>
          }
        />
      </Section>

      <Section title="Performance" icon={<Gauge className="h-3.5 w-3.5" />} defaultOpen={false}>
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

      {peerData && (peerData.geoCountry || peerData.geoCity) && (
        <Section title="Location" icon={<Globe className="h-3.5 w-3.5" />} defaultOpen={false}>
          {peerData.geoCountry && <DetailRow label="Country" value={peerData.geoCountry} />}
          {peerData.geoCity && <DetailRow label="City" value={peerData.geoCity} />}
          {peerData.geoIsp && <DetailRow label="ISP" value={peerData.geoIsp} />}
          {peerData.geoLat !== null && peerData.geoLon !== null && (
            <DetailRow
              label="Coordinates"
              value={
                <span className="text-xs opacity-70">
                  {peerData.geoLat.toFixed(2)}, {peerData.geoLon.toFixed(2)}
                </span>
              }
            />
          )}
        </Section>
      )}

      {isBaker && (
        <Section title="Baker Info" icon={<Shield className="h-3.5 w-3.5" />}>
          <DetailRow
            label="Baker ID"
            value={
              <span className="text-[var(--concordium-teal)]">#{node.consensusBakerId}</span>
            }
          />
          <DetailRow label="Committee Status" value={node.bakingCommitteeMember} />
          <DetailRow
            label="Finalization"
            value={
              <span className={node.finalizationCommitteeMember ? 'text-emerald-400' : 'text-muted-foreground'}>
                {node.finalizationCommitteeMember ? 'ACTIVE' : 'INACTIVE'}
              </span>
            }
          />
        </Section>
      )}
    </div>
  );
}

export function NodeDetailPanel() {
  const { selectedNodeId, isPanelOpen, closePanel } = useAppStore();
  const { data: nodes } = useNodes();
  const { peers } = usePeers();

  const { selectedNode, maxHeight, peerData } = useMemo(() => {
    if (!nodes || !selectedNodeId) return { selectedNode: null, maxHeight: 0, peerData: undefined };
    const node = nodes.find((n) => n.nodeId === selectedNodeId);
    const max = Math.max(...nodes.map((n) => n.finalizedBlockHeight));
    const peer = peers.find((p) => p.peerId === selectedNodeId);
    return { selectedNode: node, maxHeight: max, peerData: peer };
  }, [nodes, selectedNodeId, peers]);

  if (!isPanelOpen || !selectedNode) return null;

  const health = calculateNodeHealth(selectedNode, maxHeight);
  const isBaker =
    selectedNode.bakingCommitteeMember === 'ActiveInCommittee' &&
    selectedNode.consensusBakerId !== null;

  const healthStyles = {
    healthy: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
    lagging: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
    issue: 'bg-red-500/20 text-red-400 border-red-500/50',
  }[health];

  return (
    <div className="fixed right-0 top-16 bottom-20 w-96 border-l border-[var(--concordium-teal)]/20 bg-background/95 backdrop-blur-md z-50 flex flex-col panel-slide-in">
      {/* Decorative corner elements */}
      <div className="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-[var(--concordium-teal)]/50" />
      <div className="absolute top-0 right-0 w-4 h-4 border-r-2 border-t-2 border-[var(--concordium-teal)]/50" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-l-2 border-b-2 border-[var(--concordium-teal)]/50" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 border-[var(--concordium-teal)]/50" />

      {/* Left border glow */}
      <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-[var(--concordium-teal)]/50 via-[var(--concordium-teal)]/20 to-[var(--concordium-teal)]/50" />

      {/* Header */}
      <div className="p-4 border-b border-[var(--concordium-teal)]/20 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-[10px] font-mono text-muted-foreground tracking-widest">
              NODE DETAILS
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-[var(--concordium-teal)]/30 to-transparent" />
          </div>
          <h2 className="font-mono font-bold text-base truncate pr-2 text-[var(--concordium-teal)]">
            {selectedNode.nodeName}
          </h2>
          <div className="flex gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className={cn('text-[10px] font-mono', healthStyles)}>
              {health.toUpperCase()}
            </Badge>
            {isBaker && (
              <Badge
                variant="outline"
                className="text-[10px] font-mono bg-purple-500/20 text-purple-400 border-purple-500/50"
              >
                BAKER
              </Badge>
            )}
            {peerData && (
              <PeerTypeBadge
                source={peerData.source as PeerSource}
                isBootstrapper={peerData.isBootstrapper}
              />
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={closePanel}
          className="h-8 w-8 hover:bg-[var(--concordium-teal)]/20 hover:text-[var(--concordium-teal)]"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        <NodeDetails node={selectedNode} maxHeight={maxHeight} peerData={peerData} />
      </ScrollArea>

      {/* Footer terminal line */}
      <div className="h-8 border-t border-[var(--concordium-teal)]/20 flex items-center px-4">
        <span className="text-[10px] font-mono text-muted-foreground">
          <span className="text-[var(--concordium-teal)]">$</span> node_id: {selectedNode.nodeId.slice(0, 20)}...
        </span>
      </div>
    </div>
  );
}
