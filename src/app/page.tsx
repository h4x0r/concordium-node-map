'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import { useNetworkMetrics, useNodes } from '@/hooks/useNodes';
import { useMetricHistory, type MetricSnapshot } from '@/hooks/useMetricHistory';
import { useNodeHistory } from '@/hooks/useNodeHistory';
import { useNetworkHistory } from '@/hooks/useNetworkHistory';
import { usePeers } from '@/hooks/usePeers';
import { useValidators } from '@/hooks/useValidators';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useAudio } from '@/hooks/useAudio';
import { formatLotteryPower } from '@/lib/format-utils';
import { calculateNetworkPulse, getPulseStatus, THRESHOLDS, calculateFinalizationHealth, calculateLatencyHealth } from '@/lib/pulse';
import { calculateNodeHealth } from '@/lib/transforms';
import { Sparkline } from '@/components/dashboard/Sparkline';
import { MRTGChart, type MRTGDataPoint } from '@/components/dashboard/MRTGChart';
import { NodeDetailPanel } from '@/components/dashboard/NodeDetailPanel';
import { ConsensusVisibilityBar } from '@/components/dashboard/ConsensusVisibilityBar';
import { DeepDivePanel } from '@/components/deep-dive';
import { type HealthStatus } from '@/components/dashboard/HealthTimeline';
import { MobileHome } from '@/components/mobile/MobileHome';
import { HelpPanel } from '@/components/help';
import { CopyableTooltip } from '@/components/ui/CopyableTooltip';
import { OsintHoverCard, OsintDrawer } from '@/components/osint';
import { TransactionsView } from '@/components/dashboard/TransactionsView';
import { BlocksView } from '@/components/dashboard/BlocksView';

// Dynamic imports for heavy map components
const TopologyGraph = dynamic(
  () => import('@/components/map/TopologyGraph').then((m) => ({ default: m.TopologyGraph })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-[var(--bb-black)]">
        <span className="text-[var(--bb-gray)]">LOADING TOPOLOGY...</span>
      </div>
    ),
  }
);

const GeographicMap = dynamic(
  () => import('@/components/map/GeographicMap').then((m) => ({ default: m.GeographicMap })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-[var(--bb-black)]">
        <span className="text-[var(--bb-gray)]">LOADING GEOGRAPHIC...</span>
      </div>
    ),
  }
);

function useCurrentTime() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return time;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour12: false });
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function Home() {
  const isMobile = useIsMobile();

  // Render mobile layout on narrow screens
  if (isMobile) {
    return <MobileHome />;
  }

  // Desktop layout
  return <DesktopHome />;
}

function DesktopHome() {
  const { currentView, setView, selectedNodeId, selectNode, isDeepDiveOpen, openDeepDive, closeDeepDive, isHelpOpen, openHelp, closeHelp } = useAppStore();
  const { metrics: networkMetrics, dataUpdatedAt } = useNetworkMetrics();
  const { data: nodes } = useNodes();
  const { peers } = usePeers();
  const { data: validatorsData } = useValidators();
  const { playAcquisitionSequence } = useAudio();

  // Find selected node from nodes array
  const selectedNode = nodes?.find(n => n.nodeId === selectedNodeId) ?? null;

  // Find peer data for selected node (includes IP, geo data from gRPC)
  const selectedNodePeer = useMemo(
    () => peers.find(p => p.peerId === selectedNodeId),
    [peers, selectedNodeId]
  );

  // Create a Set of known node IDs for quick lookup (used for peer availability check)
  const knownNodeIds = useMemo(() => new Set(nodes?.map(n => n.nodeId) ?? []), [nodes]);

  // Create a map of bakerId -> Validator for quick lookup
  const validatorMap = useMemo(() => {
    const map = new Map<number, { lotteryPower: number | null }>();
    if (validatorsData?.validators) {
      for (const v of validatorsData.validators) {
        map.set(v.bakerId, { lotteryPower: v.lotteryPower });
      }
    }
    return map;
  }, [validatorsData]);

  // Get validator info for selected node (if it's a baker)
  const selectedNodeValidator = useMemo(() => {
    if (!selectedNode || selectedNode.consensusBakerId === null) return null;
    return validatorMap.get(selectedNode.consensusBakerId) ?? null;
  }, [selectedNode, validatorMap]);

  const { history, addSnapshot } = useMetricHistory();
  const { data: networkHistoryData } = useNetworkHistory(15); // 15 minutes of network-wide history from Turso
  const currentTime = useCurrentTime();
  const [commandInput, setCommandInput] = useState('');
  const [sortColumn, setSortColumn] = useState<'name' | 'peers' | 'fin' | 'status'>('peers');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [osintDrawerIp, setOsintDrawerIp] = useState<string | null>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Bloomberg-style: any typing focuses command input automatically
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if already in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      // Ignore modifier keys, function keys, and navigation keys
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.startsWith('F') && e.key.length > 1) return; // F1-F12
      if (['Escape', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock',
           'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
           'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete'].includes(e.key)) return;

      // ? opens help
      if (e.key === '?') {
        e.preventDefault();
        openHelp();
        return;
      }

      // Focus command input and let the keypress through
      commandInputRef.current?.focus();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openHelp]);

  // Filter and sort nodes based on command input and sort settings
  const filteredAndSortedNodes = useMemo(() => {
    if (!nodes) return [];

    // Filter by search term
    const searchTerm = commandInput.toLowerCase().trim();
    const filtered = searchTerm
      ? nodes.filter(node =>
          node.nodeName.toLowerCase().includes(searchTerm) ||
          node.nodeId.toLowerCase().includes(searchTerm)
        )
      : nodes;

    // Sort the filtered results - bakers always at top, then by selected column
    return [...filtered].sort((a, b) => {
      // Bakers always come first
      const aIsBaker = a.consensusBakerId !== null;
      const bIsBaker = b.consensusBakerId !== null;
      if (aIsBaker && !bIsBaker) return -1;
      if (!aIsBaker && bIsBaker) return 1;

      // Then sort by selected column
      let comparison = 0;
      switch (sortColumn) {
        case 'name':
          const nameA = (a.nodeName || a.nodeId).toLowerCase();
          const nameB = (b.nodeName || b.nodeId).toLowerCase();
          comparison = nameA.localeCompare(nameB);
          break;
        case 'peers':
          comparison = a.peersCount - b.peersCount;
          break;
        case 'fin':
          comparison = a.finalizedBlockHeight - b.finalizedBlockHeight;
          break;
        case 'status':
          comparison = (a.consensusRunning ? 1 : 0) - (b.consensusRunning ? 1 : 0);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [nodes, commandInput, sortColumn, sortDirection]);

  // Calculate max height for health comparison in Node Explorer
  const maxHeight = useMemo(() => {
    if (!nodes || !nodes.length) return 0;
    return Math.max(...nodes.map(n => n.finalizedBlockHeight));
  }, [nodes]);

  const handleSort = (column: 'name' | 'peers' | 'fin' | 'status') => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Calculate pulse and create snapshot from network metrics
  useEffect(() => {
    if (!networkMetrics) return;

    // Calculate consensus node count from percentage
    const consensusNodeCount = Math.round((networkMetrics.consensusParticipation / 100) * networkMetrics.totalNodes);

    const pulse = calculateNetworkPulse({
      // maxFinalizationLag is blocks behind - treat 0-2 blocks as healthy, 10+ as timeout
      // This maps well to the 2-10 second thresholds (blocks lag ≈ sync health)
      finalizationTime: networkMetrics.maxFinalizationLag,
      latency: networkMetrics.avgLatency,
      consensusRunning: consensusNodeCount,
      totalNodes: networkMetrics.totalNodes,
    });

    const snapshot: MetricSnapshot = {
      timestamp: Date.now(),
      nodes: networkMetrics.totalNodes,
      finalizationTime: networkMetrics.maxFinalizationLag,
      latency: networkMetrics.avgLatency,
      packets: 1200000,
      consensus: networkMetrics.consensusParticipation,
      pulse,
    };

    addSnapshot(snapshot);
  }, [networkMetrics, addSnapshot]);

  // Get current metrics or defaults
  const currentMetrics: MetricSnapshot = history.length > 0
    ? history[history.length - 1]
    : {
        timestamp: Date.now(),
        nodes: networkMetrics?.totalNodes ?? 0,
        finalizationTime: networkMetrics?.maxFinalizationLag ?? 0,
        latency: networkMetrics?.avgLatency ?? 50,
        packets: 1200000,
        consensus: networkMetrics?.consensusParticipation ?? 0,
        pulse: 100,
      };

  const pulseStatus = getPulseStatus(currentMetrics.pulse);
  const pulseColorClass = pulseStatus.label === 'NOMINAL' ? 'positive' :
                          pulseStatus.label === 'ELEVATED' ? 'warning' :
                          pulseStatus.label === 'DEGRADED' ? 'warning' : 'negative';

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const secondsAgo = lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000) : 0;
  const secondsUntilRefresh = Math.max(0, 30 - secondsAgo);

  // Fetch real per-node history data from Turso
  const { data: nodeHistoryData, isLoading: isHistoryLoading, isError: isHistoryError, dataPoints: historyDataPoints } = useNodeHistory(
    selectedNode?.nodeId ?? null,
    60 // 60 minutes of history (wider window to handle cron gaps)
  );

  // Get sparkline data - prefer Turso data when available
  const pulseSparkline = networkHistoryData?.pulseHistory.map(h => h.value) ?? history.map(h => h.pulse);
  const nodesSparkline = networkHistoryData?.nodesHistory.map(h => h.value) ?? history.map(h => h.nodes);

  // Convert history to MRTG chart data format with HEALTH SCORES (0-100)
  // These are the 3 components that make up the pulse score:
  // - 40% finalization health (sync lag)
  // - 30% latency health
  // - 30% consensus health
  // Prefer Turso data when available, fall back to in-memory history
  const pulseChartData = useMemo((): MRTGDataPoint[] =>
    networkHistoryData?.pulseHistory ?? history.map(h => ({ timestamp: h.timestamp, value: h.pulse })),
    [networkHistoryData, history]
  );

  const finalizationHealthData = useMemo((): MRTGDataPoint[] => {
    if (networkHistoryData?.finalizationLagHistory.length) {
      // Convert lag values to health scores
      return networkHistoryData.finalizationLagHistory.map(h => ({
        timestamp: h.timestamp,
        value: calculateFinalizationHealth(h.value),
      }));
    }
    return history.map(h => ({
      timestamp: h.timestamp,
      value: calculateFinalizationHealth(h.finalizationTime),
    }));
  }, [networkHistoryData, history]);

  const latencyHealthData = useMemo((): MRTGDataPoint[] => {
    if (networkHistoryData?.latencyHistory.length) {
      // Convert latency values to health scores
      return networkHistoryData.latencyHistory.map(h => ({
        timestamp: h.timestamp,
        value: calculateLatencyHealth(h.value),
      }));
    }
    return history.map(h => ({
      timestamp: h.timestamp,
      value: calculateLatencyHealth(h.latency),
    }));
  }, [networkHistoryData, history]);

  const consensusHealthData = useMemo((): MRTGDataPoint[] =>
    networkHistoryData?.consensusHistory ?? history.map(h => ({
      timestamp: h.timestamp,
      value: h.consensus, // Already 0-100 percentage
    })),
    [networkHistoryData, history]
  );

  return (
    <main className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--bb-black)]">
      {/* ===== COMMAND BAR ===== */}
      <div className="bb-command-bar">
        <a
          href="https://www.concordium.com"
          target="_blank"
          rel="noopener noreferrer"
          className="bb-logo"
          style={{ textDecoration: 'none' }}
        >
          <svg className="bb-logo-icon" viewBox="0 0 170 169" fill="currentColor">
            <path d="M25.9077 84.5718C25.9077 116.886 52.3315 143.06 84.9828 143.06C93.7219 143.06 102.014 141.105 109.48 137.743V165.186C101.739 167.485 93.5155 168.754 84.9828 168.754C38.053 168.754 0 131.088 0 84.5718C0 38.0553 38.053 0.389404 85.0172 0.389404C93.5499 0.389404 101.739 1.65866 109.514 3.95703V31.4003C102.048 28.0042 93.7563 26.0832 85.0172 26.0832C52.4003 26.0832 25.9421 52.2573 25.9421 84.5718H25.9077ZM84.9828 120.214C65.0961 120.214 48.9597 104.262 48.9597 84.5375C48.9597 64.8126 65.0961 48.8611 84.9828 48.8611C104.869 48.8611 121.006 64.8469 121.006 84.5375C121.006 104.228 104.869 120.214 84.9828 120.214ZM162.018 120.214H131.741C139.413 110.334 144.058 98.019 144.058 84.5718C144.058 71.1245 139.413 58.775 131.706 48.8955H161.983C167.11 59.7356 170 71.8106 170 84.5718C170 97.3329 167.11 109.408 161.983 120.214" />
          </svg>
          <div className="bb-logo-text">
            <span className="bb-logo-title">CONCORDIUM</span>
            <span className="bb-logo-subtitle">Network Terminal</span>
          </div>
        </a>

        <input
          ref={commandInputRef}
          type="text"
          className="bb-command-input"
          placeholder="Start typing to search nodes..."
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
        />

        <div className="flex items-center gap-2">
          <button className="bb-function-key">F1</button>
          <button className="bb-function-key">F2</button>
          <button className="bb-function-key secondary" onClick={openHelp}>HELP</button>
        </div>

        <ConsensusVisibilityBar />

        <div className="bb-time">
          <span className="bb-time-value">{formatTime(currentTime)}</span>
          <span className="bb-time-zone">UTC</span>
        </div>
      </div>

      {/* ===== TICKER BAR ===== */}
      <div className="bb-ticker">
        <span className="bb-ticker-label">LIVE</span>
        <div className="bb-ticker-content">
          <div className="bb-ticker-item">
            <span className="bb-ticker-symbol">NODES</span>
            <span className="bb-ticker-value">{currentMetrics.nodes}</span>
            <span className="bb-ticker-change up">▲ ACTIVE</span>
          </div>
          <div className="bb-ticker-item">
            <span className="bb-ticker-symbol">PULSE</span>
            <span className="bb-ticker-value">{currentMetrics.pulse}%</span>
            <span className={`bb-ticker-change ${pulseColorClass === 'positive' ? 'up' : 'down'}`}>
              {pulseStatus.label}
            </span>
          </div>
          <div className="bb-ticker-item">
            <span className="bb-ticker-symbol">SYNC LAG</span>
            <span className="bb-ticker-value">{currentMetrics.finalizationTime} blks</span>
          </div>
          <div className="bb-ticker-item">
            <span className="bb-ticker-symbol">CONSENSUS</span>
            <span className="bb-ticker-value">{currentMetrics.consensus}%</span>
            <span className={`bb-ticker-change ${currentMetrics.consensus >= THRESHOLDS.CONSENSUS_QUORUM ? 'up' : 'down'}`}>
              {currentMetrics.consensus >= THRESHOLDS.CONSENSUS_QUORUM ? 'QUORUM' : 'NO QUORUM'}
            </span>
          </div>
          <div className="bb-ticker-item">
            <span className="bb-ticker-symbol">LATENCY</span>
            <span className="bb-ticker-value">{currentMetrics.latency}ms</span>
          </div>
          {/* Duplicate for seamless scroll */}
          <div className="bb-ticker-item">
            <span className="bb-ticker-symbol">NODES</span>
            <span className="bb-ticker-value">{currentMetrics.nodes}</span>
            <span className="bb-ticker-change up">▲ ACTIVE</span>
          </div>
          <div className="bb-ticker-item">
            <span className="bb-ticker-symbol">PULSE</span>
            <span className="bb-ticker-value">{currentMetrics.pulse}%</span>
          </div>
        </div>
      </div>

      {/* ===== MAIN CONTENT GRID ===== */}
      <div className="flex-1 min-h-0 bb-grid" style={{ gridTemplateColumns: '280px 1fr 400px', gridTemplateRows: '1fr' }}>

        {/* ===== LEFT COLUMN - METRICS + NODE DETAILS ===== */}
        <div className="bb-grid-cell flex flex-col" >
          {/* Network Pulse Panel - Compact */}
          <div className="bb-panel flex-shrink-0">
            <div className="bb-panel-header" style={{ padding: '4px 8px', fontSize: '10px' }}>Network Pulse</div>
            <div className="bb-panel-body" style={{ padding: '6px 8px' }}>
              <div className="flex items-baseline justify-between">
                <span className={`bb-metric-value ${pulseColorClass}`} style={{ fontSize: '20px' }}>{currentMetrics.pulse}%</span>
                <span className={`text-[10px] font-bold ${pulseColorClass === 'positive' ? 'text-[var(--bb-green)]' : pulseColorClass === 'warning' ? 'text-[var(--bb-amber)]' : 'text-[var(--bb-red)]'}`}>
                  {pulseStatus.label}
                </span>
              </div>
              <div className="bb-metric-spark" style={{ height: '20px' }}>
                <Sparkline data={pulseSparkline} min={0} max={100} maxBars={20} />
              </div>
            </div>
          </div>

          {/* Metrics Grid - Compact */}
          <div className="bb-metrics-grid flex-shrink-0" style={{ gridTemplateColumns: '1fr 1fr', gap: '2px', padding: '4px' }}>
            <div className="bb-metric" style={{ padding: '4px 6px' }}>
              <span className="bb-metric-label" style={{ fontSize: '8px' }}>Nodes</span>
              <span className="bb-metric-value" style={{ fontSize: '14px' }}>{currentMetrics.nodes}</span>
            </div>
            <div className="bb-metric" style={{ padding: '4px 6px' }}>
              <span className="bb-metric-label" style={{ fontSize: '8px' }}>Avg Peers</span>
              <span className="bb-metric-value" style={{ fontSize: '14px' }}>{networkMetrics?.avgPeers ?? 0}</span>
            </div>
            <div className="bb-metric" style={{ padding: '4px 6px' }}>
              <span className="bb-metric-label" style={{ fontSize: '8px' }}>Sync Lag</span>
              <span className={`bb-metric-value ${currentMetrics.finalizationTime >= THRESHOLDS.FINALIZATION_TIMEOUT ? 'negative' : currentMetrics.finalizationTime >= THRESHOLDS.FINALIZATION_OPTIMAL ? 'warning' : ''}`} style={{ fontSize: '14px' }}>
                {currentMetrics.finalizationTime} blks
              </span>
            </div>
            <div className="bb-metric" style={{ padding: '4px 6px' }}>
              <span className="bb-metric-label" style={{ fontSize: '8px' }}>Consensus</span>
              <span className={`bb-metric-value ${currentMetrics.consensus < THRESHOLDS.CONSENSUS_QUORUM ? 'negative' : 'positive'}`} style={{ fontSize: '14px' }}>
                {currentMetrics.consensus}%
              </span>
            </div>
            <div className="bb-metric" style={{ padding: '4px 6px' }}>
              <span className="bb-metric-label" style={{ fontSize: '8px' }}>Latency</span>
              <span className="bb-metric-value" style={{ fontSize: '14px' }}>{currentMetrics.latency}ms</span>
            </div>
            <div className="bb-metric" style={{ padding: '4px 6px' }}>
              <span className="bb-metric-label" style={{ fontSize: '8px' }}>Refresh</span>
              <span className="bb-metric-value" style={{ fontSize: '14px' }}>{secondsUntilRefresh}s</span>
            </div>
          </div>

          {/* Alerts Panel - Compact */}
          <div className="bb-panel flex-shrink-0">
            <div className="bb-panel-header amber" style={{ padding: '4px 8px', fontSize: '10px' }}>Alerts</div>
            <div className="bb-panel-body" style={{ maxHeight: '60px', padding: '4px 8px', fontSize: '10px' }}>
              {currentMetrics.consensus < THRESHOLDS.CONSENSUS_QUORUM && (
                <div className="bb-alert error">
                  CRITICAL: Consensus below quorum ({currentMetrics.consensus}% &lt; {THRESHOLDS.CONSENSUS_QUORUM}%)
                </div>
              )}
              {currentMetrics.finalizationTime >= THRESHOLDS.FINALIZATION_TIMEOUT && (
                <div className="bb-alert warning">
                  WARNING: High sync lag ({currentMetrics.finalizationTime} blocks)
                </div>
              )}
              {currentMetrics.pulse < 90 && currentMetrics.pulse >= THRESHOLDS.CONSENSUS_QUORUM && (
                <div className="bb-alert warning">
                  ELEVATED: Network pulse degraded ({currentMetrics.pulse}%)
                </div>
              )}
              {currentMetrics.pulse >= 90 && (
                <div className="bb-alert success">
                  NOMINAL: All systems operational
                </div>
              )}
            </div>
          </div>

          {/* Node Details Panel - takes remaining space */}
          <div className={`bb-panel flex-1 flex flex-col min-h-0 ${selectedNode?.consensusBakerId !== null ? 'bb-baker-panel' : ''}`}>
            <div className="bb-panel-header dark">
              Node Details
              {selectedNode && (
                <span className="text-[var(--bb-cyan)] font-normal ml-2">
                  {selectedNode.consensusBakerId !== null && <span className="bb-baker-emoji" title="Baker">🥖</span>}
                  {selectedNode.nodeName || selectedNode.nodeId.slice(0, 12)}
                </span>
              )}
            </div>
            <div className="bb-panel-body flex-1 overflow-auto">
              {selectedNode ? (
                <div className="bb-forensic">
                  {/* Identity */}
                  <div className="bb-forensic-section">
                    <div className="bb-forensic-section-header">IDENTITY</div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Node ID</span>
                      <CopyableTooltip
                        value={selectedNode.nodeId}
                        displayValue={`${selectedNode.nodeId.slice(0, 24)}...`}
                        className="bb-forensic-value mono"
                      />
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Name</span>
                      <span className="bb-forensic-value">{selectedNode.nodeName || 'Unnamed'}</span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Client</span>
                      <span className="bb-forensic-value">{selectedNode.client}</span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Type</span>
                      <span className="bb-forensic-value">{selectedNode.peerType}</span>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="bb-forensic-section">
                    <div className="bb-forensic-section-header">STATUS</div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Consensus</span>
                      <span className={`bb-forensic-value ${selectedNode.consensusRunning ? 'text-[var(--bb-green)]' : 'text-[var(--bb-red)]'}`}>
                        {selectedNode.consensusRunning ? 'RUNNING' : 'STOPPED'}
                      </span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Uptime</span>
                      <span className="bb-forensic-value">{Math.floor(selectedNode.uptime / 3600)}h {Math.floor((selectedNode.uptime % 3600) / 60)}m</span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Baker ID</span>
                      <span className={`bb-forensic-value ${selectedNode.consensusBakerId !== null ? 'text-[var(--bb-magenta)]' : ''}`}>
                        {selectedNode.consensusBakerId !== null ? `#${selectedNode.consensusBakerId}` : 'N/A'}
                      </span>
                    </div>
                    {selectedNodeValidator && (
                      <div className="bb-forensic-row">
                        <span className="bb-forensic-label">Lottery Power</span>
                        <span className="bb-forensic-value text-[var(--bb-magenta)]">
                          {formatLotteryPower(selectedNodeValidator.lotteryPower)}
                        </span>
                      </div>
                    )}
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Finalizer</span>
                      <span className={`bb-forensic-value ${selectedNode.finalizationCommitteeMember ? 'text-[var(--bb-cyan)]' : ''}`}>
                        {selectedNode.finalizationCommitteeMember ? 'YES' : 'NO'}
                      </span>
                    </div>
                  </div>

                  {/* Network */}
                  <div className="bb-forensic-section">
                    <div className="bb-forensic-section-header">NETWORK</div>
                    {selectedNodePeer?.ipAddress && (
                      <div className="bb-forensic-row">
                        <span className="bb-forensic-label">IP Address</span>
                        <OsintHoverCard
                          ip={selectedNodePeer.ipAddress}
                          onClickForFull={() => setOsintDrawerIp(selectedNodePeer.ipAddress)}
                        >
                          <span className="bb-forensic-value text-[var(--bb-cyan)]">
                            {selectedNodePeer.ipAddress}:{selectedNodePeer.port}
                          </span>
                        </OsintHoverCard>
                      </div>
                    )}
                    {selectedNodePeer?.geoCountry && (
                      <div className="bb-forensic-row">
                        <span className="bb-forensic-label">Location</span>
                        <span className="bb-forensic-value">{selectedNodePeer.geoCity ? `${selectedNodePeer.geoCity}, ` : ''}{selectedNodePeer.geoCountry}</span>
                      </div>
                    )}
                    {selectedNodePeer?.geoIsp && (
                      <div className="bb-forensic-row">
                        <span className="bb-forensic-label">ISP</span>
                        <span className="bb-forensic-value text-[var(--bb-gray)]">{selectedNodePeer.geoIsp}</span>
                      </div>
                    )}
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Peers</span>
                      <span className="bb-forensic-value text-[var(--bb-cyan)]">{selectedNode.peersCount}</span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Latency</span>
                      <span className="bb-forensic-value">{selectedNode.averagePing?.toFixed(0) ?? 'N/A'}ms</span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">BW In</span>
                      <span className="bb-forensic-value">{selectedNode.averageBytesPerSecondIn ? `${(selectedNode.averageBytesPerSecondIn / 1024).toFixed(1)} KB/s` : 'N/A'}</span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">BW Out</span>
                      <span className="bb-forensic-value">{selectedNode.averageBytesPerSecondOut ? `${(selectedNode.averageBytesPerSecondOut / 1024).toFixed(1)} KB/s` : 'N/A'}</span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Packets</span>
                      <span className="bb-forensic-value text-[var(--bb-gray)]">
                        ↓{(selectedNode.packetsReceived / 1000000).toFixed(1)}M ↑{(selectedNode.packetsSent / 1000000).toFixed(1)}M
                      </span>
                    </div>
                  </div>

                  {/* Timing */}
                  <div className="bb-forensic-section">
                    <div className="bb-forensic-section-header">TIMING</div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Block Period</span>
                      <span className="bb-forensic-value">{selectedNode.blockArrivePeriodEMA?.toFixed(2) ?? 'N/A'}s</span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Fin Period</span>
                      <span className="bb-forensic-value">{selectedNode.finalizationPeriodEMA?.toFixed(2) ?? 'N/A'}s</span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Blocks Recv</span>
                      <span className="bb-forensic-value">{selectedNode.blocksReceivedCount.toLocaleString()}</span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Finalizations</span>
                      <span className="bb-forensic-value">{selectedNode.finalizationCount.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Blockchain */}
                  <div className="bb-forensic-section">
                    <div className="bb-forensic-section-header">BLOCKCHAIN</div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Best Height</span>
                      <span className="bb-forensic-value text-[var(--bb-amber)]">{selectedNode.bestBlockHeight.toLocaleString()}</span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Finalized</span>
                      <span className="bb-forensic-value">{selectedNode.finalizedBlockHeight.toLocaleString()}</span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Best Block</span>
                      <CopyableTooltip
                        value={selectedNode.bestBlock ?? ''}
                        displayValue={`${selectedNode.bestBlock?.slice(0, 16)}...`}
                        className="bb-forensic-value hash"
                      />
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Fin Block</span>
                      <CopyableTooltip
                        value={selectedNode.finalizedBlock ?? ''}
                        displayValue={`${selectedNode.finalizedBlock?.slice(0, 16)}...`}
                        className="bb-forensic-value hash"
                      />
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">TXs/Block</span>
                      <span className="bb-forensic-value">{selectedNode.transactionsPerBlockEMA?.toFixed(2) ?? 'N/A'}</span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Last Baker</span>
                      <span className="bb-forensic-value text-[var(--bb-magenta)]">#{selectedNode.bestBlockBakerId ?? 'N/A'}</span>
                    </div>
                  </div>

                  {/* Connected Peers */}
                  {selectedNode.peersList.length > 0 && (
                    <div className="bb-forensic-section">
                      <div className="bb-forensic-section-header">
                        CONNECTED PEERS ({selectedNode.peersList.length})
                        <span className="text-[var(--bb-gray)] font-normal ml-2 text-[8px]">
                          {selectedNode.peersList.filter(id => knownNodeIds.has(id)).length} in dashboard
                        </span>
                      </div>
                      <div className="bb-peer-list">
                        {selectedNode.peersList.map((peerId) => {
                          const isAvailable = knownNodeIds.has(peerId);
                          return (
                            <button
                              key={peerId}
                              onClick={() => isAvailable && selectNode(peerId)}
                              className={`bb-peer-item ${isAvailable ? 'available' : 'phantom'}`}
                              disabled={!isAvailable}
                              title={isAvailable ? 'Click to view this node' : 'Phantom node - not reporting to dashboard'}
                            >
                              {peerId.slice(0, 8)}...
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[var(--bb-gray)] text-center py-8">
                  Select a node to view details
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== CENTER - VISUALIZATION ===== */}
        <div className="bb-grid-cell flex flex-col" >
          {/* View Tabs */}
          <div className="bb-tabs flex-shrink-0">
            <button
              className={`bb-tab ${currentView === 'topology' ? 'active' : ''}`}
              onClick={() => setView('topology')}
            >
              Topology
            </button>
            <button
              className={`bb-tab ${currentView === 'geographic' ? 'active' : ''}`}
              onClick={() => setView('geographic')}
            >
              Geographic
            </button>
            <button
              className={`bb-tab ${currentView === 'transactions' ? 'active' : ''}`}
              onClick={() => setView('transactions')}
            >
              Transactions
            </button>
            <button
              className={`bb-tab ${currentView === 'blocks' ? 'active' : ''}`}
              onClick={() => setView('blocks')}
            >
              Blocks
            </button>
            <div className="flex-1" />
            <div className="bb-tab" style={{ cursor: 'default', color: 'var(--bb-gray)' }}>
              {formatDate(currentTime)}
            </div>
          </div>

          {/* Map/Data Content */}
          <div className="flex-1 min-h-0 relative">
            {currentView === 'topology' && <TopologyGraph />}
            {currentView === 'geographic' && <GeographicMap />}
            {currentView === 'transactions' && <TransactionsView />}
            {currentView === 'blocks' && <BlocksView />}
          </div>

          {/* Per-Node Detail Panel - shows when a node is selected */}
          {selectedNode && (
            <div className="flex-shrink-0">
              {isHistoryLoading ? (
                <div className="bb-node-detail-loading" style={{
                  padding: '16px',
                  background: 'var(--bb-panel-bg)',
                  border: '1px solid var(--bb-border)',
                  color: 'var(--bb-gray)',
                  fontSize: '12px',
                }}>
                  Loading history for {selectedNode.nodeName || selectedNode.nodeId}...
                </div>
              ) : isHistoryError ? (
                <div className="bb-node-detail-error" style={{
                  padding: '16px',
                  background: 'var(--bb-panel-bg)',
                  border: '1px solid var(--bb-red)',
                  color: 'var(--bb-red)',
                  fontSize: '12px',
                }}>
                  Error loading history for {selectedNode.nodeName || selectedNode.nodeId}.
                  <br />
                  <span style={{ color: 'var(--bb-gray)' }}>Check console for details.</span>
                  <button
                    onClick={() => selectNode(null)}
                    style={{
                      marginLeft: '12px',
                      padding: '2px 8px',
                      background: 'var(--bb-border)',
                      border: 'none',
                      color: 'var(--bb-text)',
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              ) : nodeHistoryData && historyDataPoints > 0 ? (
                <NodeDetailPanel
                  nodeId={selectedNode.nodeId}
                  nodeName={selectedNode.nodeName || 'Unnamed Node'}
                  isBaker={selectedNode.bakingCommitteeMember === 'ActiveInCommittee' && selectedNode.consensusBakerId !== null}
                  healthHistory={nodeHistoryData.healthHistory}
                  latencyHistory={nodeHistoryData.latencyHistory}
                  bandwidthInHistory={nodeHistoryData.bandwidthInHistory}
                  bandwidthOutHistory={nodeHistoryData.bandwidthOutHistory}
                  peerCountHistory={nodeHistoryData.peerCountHistory}
                  onClose={() => selectNode(null)}
                  onOpenDeepDive={openDeepDive}
                />
              ) : (
                <div className="bb-node-detail-empty" style={{
                  padding: '16px',
                  background: 'var(--bb-panel-bg)',
                  border: '1px solid var(--bb-border)',
                  color: 'var(--bb-amber)',
                  fontSize: '12px',
                }}>
                  No history data yet for {selectedNode.nodeName || selectedNode.nodeId}.
                  <br />
                  <span style={{ color: 'var(--bb-gray)' }}>
                    {historyDataPoints === 0 ? 'Cron is running but no snapshots stored yet.' : 'Data collection started - check back in a few minutes.'}
                  </span>
                  <button
                    onClick={() => selectNode(null)}
                    style={{
                      marginLeft: '12px',
                      padding: '2px 8px',
                      background: 'var(--bb-border)',
                      border: 'none',
                      color: 'var(--bb-text)',
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          )}

          {/* MRTG Historical Charts - Health Scores (0-100) with auto color based on health */}
          <div className="flex-shrink-0 bb-mrtg-row">
            <MRTGChart
              data={pulseChartData}
              label="Network Pulse"
              unit="%"
              min={0}
              max={100}
            />
            <MRTGChart
              data={finalizationHealthData}
              label="Sync Health"
              unit="%"
              min={0}
              max={100}
              rawValue={currentMetrics.finalizationTime}
              rawUnit=" blks"
            />
            <MRTGChart
              data={latencyHealthData}
              label="Latency Health"
              unit="%"
              min={0}
              max={100}
              rawValue={currentMetrics.latency}
              rawUnit="ms"
            />
            <MRTGChart
              data={consensusHealthData}
              label="Consensus"
              unit="%"
              thresholds={{ green: THRESHOLDS.CONSENSUS_QUORUM, amber: 50, orange: 33 }}
              min={0}
              max={100}
              rawValue={currentMetrics.consensus}
              rawUnit="%"
            />
          </div>
        </div>

        {/* ===== RIGHT COLUMN - NODE LIST ===== */}
        <div className="bb-grid-cell flex flex-col" >
          <div className="bb-panel flex-1 flex flex-col">
            <div className="bb-panel-header dark">
              Node Explorer
              <span className="text-[var(--bb-gray)] font-normal ml-2">
                ({commandInput ? `${filteredAndSortedNodes.length}/` : ''}{nodes?.length ?? 0})
              </span>
            </div>
            <div className="bb-panel-body no-padding flex-1 overflow-auto">
              <table className="bb-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                      Node ID {sortColumn === 'name' && (sortDirection === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => handleSort('peers')} style={{ cursor: 'pointer' }}>
                      Peers {sortColumn === 'peers' && (sortDirection === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => handleSort('fin')} style={{ cursor: 'pointer' }}>
                      Fin {sortColumn === 'fin' && (sortDirection === 'asc' ? '▲' : '▼')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedNodes.map((node) => {
                    const isBaker = node.consensusBakerId !== null;
                    const health = calculateNodeHealth(node, maxHeight);
                    const statusClass = {
                      healthy: 'bb-status-dot-healthy',
                      lagging: 'bb-status-dot-lagging',
                      issue: 'bb-status-dot-issue',
                    }[health];
                    const statusTitle = health.charAt(0).toUpperCase() + health.slice(1);

                    return (
                      <tr
                        key={node.nodeId}
                        className={`${isBaker ? 'bb-baker-row' : ''} ${selectedNodeId === node.nodeId ? 'selected' : ''}`}
                        onClick={() => {
                          playAcquisitionSequence();
                          selectNode(node.nodeId);
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <td
                          className="text-[var(--bb-cyan)]"
                          title={node.nodeName || node.nodeId}
                          style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          <span className={`bb-status-dot ${statusClass}`} title={statusTitle} />
                          {isBaker && <span className="bb-baker-emoji" title="Baker">🥖</span>}
                          {node.nodeName || node.nodeId.slice(0, 16)}
                        </td>
                        <td className="num">{node.peersCount}</td>
                        <td className="num">{node.finalizedBlockHeight}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      {/* ===== DEEP DIVE PANEL ===== */}
      {selectedNode && (
        <DeepDivePanel
          nodeId={selectedNode.nodeId}
          nodeName={selectedNode.nodeName || 'Unnamed Node'}
          isOpen={isDeepDiveOpen}
          onClose={closeDeepDive}
          allNodes={nodes?.map(n => ({ nodeId: n.nodeId, nodeName: n.nodeName || n.nodeId })) ?? []}
        />
      )}

      {/* ===== HELP PANEL ===== */}
      <HelpPanel isOpen={isHelpOpen} onClose={closeHelp} />

      {/* ===== STATUS BAR ===== */}
      <div className="bb-status-bar">
        <div className="bb-status-item">
          <div className={`bb-status-dot ${pulseStatus.label === 'NOMINAL' ? '' : pulseStatus.label === 'CRITICAL' ? 'error' : 'warning'}`} />
          <span className="bb-status-label">Status:</span>
          <span className={`bb-status-value ${pulseStatus.label === 'NOMINAL' ? 'live' : pulseStatus.label === 'CRITICAL' ? 'error' : 'warning'}`}>
            {pulseStatus.label}
          </span>
        </div>
        <div className="bb-status-item">
          <span className="bb-status-label">Nodes:</span>
          <span className="bb-status-value">{currentMetrics.nodes}</span>
        </div>
        <div className="bb-status-item">
          <span className="bb-status-label">Consensus:</span>
          <span className={`bb-status-value ${currentMetrics.consensus >= THRESHOLDS.CONSENSUS_QUORUM ? 'live' : ''}`}>
            {currentMetrics.consensus}%
          </span>
        </div>
        <div className="bb-status-item">
          <span className="bb-status-label">Sync Lag:</span>
          <span className="bb-status-value">{currentMetrics.finalizationTime} blks</span>
        </div>
        <div className="flex-1" />
        <div className="bb-status-item">
          <span className="bb-status-label">Refresh:</span>
          <span className="bb-status-value">{secondsUntilRefresh}s</span>
        </div>
        <div className="bb-status-item">
          <span className="bb-status-value" style={{ color: 'var(--bb-amber)' }}>
            CONCORDIUM MAINNET
          </span>
        </div>
      </div>

      {/* OSINT Drawer */}
      {osintDrawerIp && (
        <OsintDrawer
          ip={osintDrawerIp}
          onClose={() => setOsintDrawerIp(null)}
        />
      )}

    </main>
  );
}
