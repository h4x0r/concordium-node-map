'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import { useNetworkMetrics, useNodes } from '@/hooks/useNodes';
import { useMetricHistory, type MetricSnapshot } from '@/hooks/useMetricHistory';
import { useNodeHistory } from '@/hooks/useNodeHistory';
import { useNetworkHistory } from '@/hooks/useNetworkHistory';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useAudio } from '@/hooks/useAudio';
import { calculateNetworkPulse, getPulseStatus, THRESHOLDS, calculateFinalizationHealth, calculateLatencyHealth } from '@/lib/pulse';
import { Sparkline } from '@/components/dashboard/Sparkline';
import { MRTGChart, type MRTGDataPoint } from '@/components/dashboard/MRTGChart';
import { NodeDetailPanel } from '@/components/dashboard/NodeDetailPanel';
import { DeepDivePanel } from '@/components/deep-dive';
import { type HealthStatus } from '@/components/dashboard/HealthTimeline';
import { MobileHome } from '@/components/mobile/MobileHome';
import { HelpPanel } from '@/components/help';
import { CopyableTooltip } from '@/components/ui/CopyableTooltip';

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
  const { playAcquisitionSequence } = useAudio();

  // Find selected node from nodes array
  const selectedNode = nodes?.find(n => n.nodeId === selectedNodeId) ?? null;

  // Create a Set of known node IDs for quick lookup (used for peer availability check)
  const knownNodeIds = useMemo(() => new Set(nodes?.map(n => n.nodeId) ?? []), [nodes]);
  const { history, addSnapshot } = useMetricHistory();
  const { data: networkHistoryData } = useNetworkHistory(15); // 15 minutes of network-wide history from Turso
  const currentTime = useCurrentTime();
  const [commandInput, setCommandInput] = useState('');
  const [sortColumn, setSortColumn] = useState<'name' | 'peers' | 'fin' | 'status'>('peers');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
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

    // Sort the filtered results
    return [...filtered].sort((a, b) => {
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
      <div className="flex-1 min-h-0 bb-grid" style={{ gridTemplateColumns: '280px 1fr 400px', gridTemplateRows: 'auto 1fr' }}>

        {/* ===== LEFT COLUMN - METRICS ===== */}
        <div className="bb-grid-cell flex flex-col">
          {/* Network Pulse Panel */}
          <div className="bb-panel flex-shrink-0">
            <div className="bb-panel-header">Network Pulse</div>
            <div className="bb-panel-body">
              <div className="flex items-baseline justify-between mb-2">
                <span className={`bb-metric-value large ${pulseColorClass}`}>{currentMetrics.pulse}%</span>
                <span className={`text-xs font-bold ${pulseColorClass === 'positive' ? 'text-[var(--bb-green)]' : pulseColorClass === 'warning' ? 'text-[var(--bb-amber)]' : 'text-[var(--bb-red)]'}`}>
                  {pulseStatus.label}
                </span>
              </div>
              <div className="bb-metric-spark">
                <Sparkline data={pulseSparkline} min={0} max={100} maxBars={20} />
              </div>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="bb-metrics-grid flex-1" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="bb-metric">
              <span className="bb-metric-label">Nodes</span>
              <span className="bb-metric-value">{currentMetrics.nodes}</span>
              <div className="bb-metric-spark">
                <Sparkline data={nodesSparkline} maxBars={12} />
              </div>
            </div>
            <div className="bb-metric">
              <span className="bb-metric-label">Avg Peers</span>
              <span className="bb-metric-value">{networkMetrics?.avgPeers ?? 0}</span>
            </div>
            <div className="bb-metric">
              <span className="bb-metric-label">Sync Lag</span>
              <span className={`bb-metric-value ${currentMetrics.finalizationTime >= THRESHOLDS.FINALIZATION_TIMEOUT ? 'negative' : currentMetrics.finalizationTime >= THRESHOLDS.FINALIZATION_OPTIMAL ? 'warning' : ''}`}>
                {currentMetrics.finalizationTime} blks
              </span>
            </div>
            <div className="bb-metric">
              <span className="bb-metric-label">Consensus</span>
              <span className={`bb-metric-value ${currentMetrics.consensus < THRESHOLDS.CONSENSUS_QUORUM ? 'negative' : 'positive'}`}>
                {currentMetrics.consensus}%
              </span>
            </div>
            <div className="bb-metric">
              <span className="bb-metric-label">Latency</span>
              <span className="bb-metric-value">{currentMetrics.latency}ms</span>
            </div>
            <div className="bb-metric">
              <span className="bb-metric-label">Refresh</span>
              <span className="bb-metric-value">{secondsUntilRefresh}s</span>
            </div>
          </div>

          {/* Alerts Panel */}
          <div className="bb-panel flex-shrink-0">
            <div className="bb-panel-header amber">Alerts</div>
            <div className="bb-panel-body" style={{ maxHeight: '120px' }}>
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
        </div>

        {/* ===== CENTER - VISUALIZATION ===== */}
        <div className="bb-grid-cell flex flex-col" style={{ gridRow: 'span 2' }}>
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
            <button className="bb-tab">Transactions</button>
            <button className="bb-tab">Blocks</button>
            <div className="flex-1" />
            <div className="bb-tab" style={{ cursor: 'default', color: 'var(--bb-gray)' }}>
              {formatDate(currentTime)}
            </div>
          </div>

          {/* Map Content */}
          <div className="flex-1 min-h-0 relative">
            {currentView === 'topology' ? <TopologyGraph /> : <GeographicMap />}
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
        <div className="bb-grid-cell flex flex-col" style={{ gridRow: 'span 2' }}>
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
                    <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                      Status {sortColumn === 'status' && (sortDirection === 'asc' ? '▲' : '▼')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedNodes.map((node) => (
                    <tr
                      key={node.nodeId}
                      className={selectedNodeId === node.nodeId ? 'selected' : ''}
                      onClick={() => {
                        playAcquisitionSequence();
                        selectNode(node.nodeId);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="text-[var(--bb-cyan)]" style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {node.nodeName || node.nodeId.slice(0, 12)}
                      </td>
                      <td className="num">{node.peersCount}</td>
                      <td className="num">{node.finalizedBlockHeight}</td>
                      <td>
                        <span className={`inline-block w-2 h-2 mr-1 ${
                          node.consensusRunning ? 'bg-[var(--bb-green)]' : 'bg-[var(--bb-red)]'
                        }`} />
                        {node.consensusRunning ? 'OK' : 'OFF'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ===== BOTTOM LEFT - NODE DETAILS ===== */}
        <div className="bb-grid-cell">
          <div className="bb-panel h-full flex flex-col">
            <div className="bb-panel-header dark">
              Node Details
              {selectedNode && (
                <span className="text-[var(--bb-cyan)] font-normal ml-2">
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
                      <span className="bb-forensic-label">Baker</span>
                      <span className={`bb-forensic-value ${selectedNode.bakingCommitteeMember === 'ActiveInCommittee' ? 'text-[var(--bb-magenta)]' : ''}`}>
                        {selectedNode.bakingCommitteeMember === 'ActiveInCommittee' ? `#${selectedNode.consensusBakerId}` : 'NO'}
                      </span>
                    </div>
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
                        {selectedNode.peersList.slice(0, 20).map((peerId) => {
                          const isAvailable = knownNodeIds.has(peerId);
                          return (
                            <span
                              key={peerId}
                              className={`bb-peer-tag ${!isAvailable ? 'bb-peer-unavailable' : ''}`}
                              onClick={() => {
                                if (isAvailable) {
                                  playAcquisitionSequence();
                                  selectNode(peerId);
                                }
                              }}
                              title={isAvailable ? 'Click to select this peer' : 'Peer not reporting to dashboard'}
                            >
                              {peerId.slice(0, 8)}
                              {!isAvailable && <span className="bb-peer-external">EXT</span>}
                            </span>
                          );
                        })}
                        {selectedNode.peersList.length > 20 && (
                          <span className="bb-peer-more">+{selectedNode.peersList.length - 20} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[var(--bb-gray)] text-xs text-center py-8">
                  Select a node from the explorer<br />or click on the topology map
                </div>
              )}
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

    </main>
  );
}
