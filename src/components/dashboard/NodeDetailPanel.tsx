'use client';

import { HealthTimeline, type HealthStatus } from './HealthTimeline';
import { MRTGChart, type MRTGDataPoint } from './MRTGChart';
import { MRTGMirroredChart } from './MRTGMirroredChart';

export interface NodeDetailPanelProps {
  nodeId: string;
  nodeName: string;
  healthHistory: HealthStatus[];
  latencyHistory: MRTGDataPoint[];
  bandwidthInHistory: MRTGDataPoint[];
  bandwidthOutHistory: MRTGDataPoint[];
  peerCountHistory: MRTGDataPoint[];
  onClose: () => void;
}

export function NodeDetailPanel({
  nodeId,
  nodeName,
  healthHistory,
  latencyHistory,
  bandwidthInHistory,
  bandwidthOutHistory,
  peerCountHistory,
  onClose,
}: NodeDetailPanelProps) {
  return (
    <div className="node-detail-panel bb-panel">
      {/* Header */}
      <div
        className="bb-panel-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          background: 'var(--bb-panel)',
          borderBottom: '1px solid var(--bb-border)',
        }}
      >
        <div>
          <span className="font-mono font-bold text-[var(--bb-orange)]">
            {nodeName}
          </span>
          <span
            className="font-mono text-[10px] text-[var(--bb-gray)] ml-2"
            style={{ opacity: 0.7 }}
          >
            {nodeId}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="close"
          className="text-[var(--bb-gray)] hover:text-[var(--bb-orange)] transition-colors"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '4px 8px',
          }}
        >
          ×
        </button>
      </div>

      {/* Health Timeline Strip */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--bb-border)',
        }}
      >
        <HealthTimeline data={healthHistory} showLabels height={12} />
      </div>

      {/* Mini Charts Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          padding: '8px 12px',
        }}
      >
        {/* Latency Chart */}
        <MRTGChart
          data={latencyHistory}
          label="Latency"
          unit="ms"
          color="cyan"
          height={80}
          showLabels={false}
        />

        {/* Mirrored Bandwidth Chart */}
        <MRTGMirroredChart
          outboundData={bandwidthOutHistory}
          inboundData={bandwidthInHistory}
          label="Bandwidth"
          unit="KB/s"
          height={80}
        />

        {/* Peer Count Chart */}
        <MRTGChart
          data={peerCountHistory}
          label="Peers"
          unit=""
          color="green"
          height={80}
          showLabels={false}
        />
      </div>
    </div>
  );
}
