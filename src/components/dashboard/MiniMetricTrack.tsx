'use client';

import { useState, useMemo } from 'react';
import type { MRTGDataPoint } from './MRTGChart';
import type { HealthStatus } from './HealthTimeline';

export type MiniMetricType = 'health' | 'latency' | 'bandwidth' | 'peers';

// Bandwidth colors: contrasting for up/down traffic (network monitoring style)
const BANDWIDTH_COLORS = {
  outbound: {
    stroke: '#ff9500', // warm orange (upload)
    glow: 'rgba(255, 149, 0, 0.5)',
  },
  inbound: {
    stroke: '#00d4ff', // cool cyan (download)
    glow: 'rgba(0, 212, 255, 0.5)',
  },
};

export interface MiniMetricTrackProps {
  label: string;
  metric: MiniMetricType;
  data?: MRTGDataPoint[];
  healthData?: HealthStatus[];
  bandwidthData?: {
    inbound: MRTGDataPoint[];
    outbound: MRTGDataPoint[];
  };
  height?: number;
  collapsible?: boolean;
}

function formatValue(value: number, metric: MiniMetricType): string {
  switch (metric) {
    case 'latency':
      return `${Math.round(value)}ms`;
    case 'peers':
      return String(Math.round(value));
    case 'bandwidth':
      return `${(value / 1024).toFixed(1)}KB/s`;
    default:
      return String(value);
  }
}

function computeSummary(
  data: MRTGDataPoint[] | undefined,
  healthData: HealthStatus[] | undefined,
  bandwidthData: { inbound: MRTGDataPoint[]; outbound: MRTGDataPoint[] } | undefined,
  metric: MiniMetricType
): string {
  if (metric === 'health' && healthData) {
    const healthy = healthData.filter((d) => d.status === 'healthy').length;
    return `${Math.round((healthy / healthData.length) * 100)}%`;
  }

  if (metric === 'bandwidth' && bandwidthData) {
    const lastIn = bandwidthData.inbound[bandwidthData.inbound.length - 1]?.value ?? 0;
    const lastOut = bandwidthData.outbound[bandwidthData.outbound.length - 1]?.value ?? 0;
    return `▲${(lastOut / 1024).toFixed(0)} ▼${(lastIn / 1024).toFixed(0)}`;
  }

  if (data && data.length > 0) {
    const lastValue = data[data.length - 1].value;
    return formatValue(lastValue, metric);
  }

  return '—';
}

function generateLinePath(
  data: MRTGDataPoint[],
  width: number,
  height: number,
  padding: { top: number; bottom: number; left: number; right: number }
): string {
  if (data.length === 0) return '';

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = data.map((d, i) => {
    const x = padding.left + (i / Math.max(1, data.length - 1)) * chartW;
    const y = padding.top + chartH - ((d.value - min) / range) * chartH;
    return `${x},${y}`;
  });

  return `M ${points.join(' L ')}`;
}

function generateStepPath(
  data: MRTGDataPoint[],
  width: number,
  height: number,
  padding: { top: number; bottom: number; left: number; right: number }
): string {
  if (data.length === 0) return '';

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  let d = '';
  data.forEach((point, i) => {
    const x = padding.left + (i / Math.max(1, data.length - 1)) * chartW;
    const y = padding.top + chartH - ((point.value - min) / range) * chartH;
    if (i === 0) {
      d = `M ${x},${y}`;
    } else {
      d += ` H ${x} V ${y}`;
    }
  });

  return d;
}

export function MiniMetricTrack({
  label,
  metric,
  data,
  healthData,
  bandwidthData,
  height = 60,
  collapsible = false,
}: MiniMetricTrackProps) {
  const [collapsed, setCollapsed] = useState(false);

  const chartWidth = 100;
  const chartHeight = 100;
  const padding = { top: 5, right: 5, bottom: 5, left: 5 };

  const summary = useMemo(
    () => computeSummary(data, healthData, bandwidthData, metric),
    [data, healthData, bandwidthData, metric]
  );

  // Health segments
  const healthSegments = useMemo(() => {
    if (metric !== 'health' || !healthData) return null;

    const segmentWidth = (chartWidth - padding.left - padding.right) / healthData.length;

    return healthData.map((point, i) => {
      const color =
        point.status === 'healthy'
          ? 'var(--bb-green)'
          : point.status === 'lagging'
          ? 'var(--bb-orange)'
          : 'var(--bb-red)';
      return {
        x: padding.left + i * segmentWidth,
        width: segmentWidth,
        color,
      };
    });
  }, [metric, healthData]);

  // Line path for latency/peers
  const linePath = useMemo(() => {
    if (!data || data.length === 0) return '';
    if (metric === 'peers') {
      return generateStepPath(data, chartWidth, chartHeight, padding);
    }
    return generateLinePath(data, chartWidth, chartHeight, padding);
  }, [data, metric]);

  // Bandwidth mirrored paths
  const bandwidthPaths = useMemo(() => {
    if (metric !== 'bandwidth' || !bandwidthData) return null;

    const centerY = chartHeight / 2;
    const halfHeight = (chartHeight - padding.top - padding.bottom) / 2;

    const allValues = [...bandwidthData.inbound, ...bandwidthData.outbound].map((d) => d.value);
    const maxBw = Math.max(...allValues, 1);

    const chartW = chartWidth - padding.left - padding.right;

    const outPoints = bandwidthData.outbound.map((d, i) => {
      const x = padding.left + (i / Math.max(1, bandwidthData.outbound.length - 1)) * chartW;
      const y = centerY - (d.value / maxBw) * halfHeight * 0.9;
      return `${x},${y}`;
    });

    const inPoints = bandwidthData.inbound.map((d, i) => {
      const x = padding.left + (i / Math.max(1, bandwidthData.inbound.length - 1)) * chartW;
      const y = centerY + (d.value / maxBw) * halfHeight * 0.9;
      return `${x},${y}`;
    });

    return {
      outPath: outPoints.length > 0 ? `M ${outPoints.join(' L ')}` : '',
      inPath: inPoints.length > 0 ? `M ${inPoints.join(' L ')}` : '',
    };
  }, [metric, bandwidthData]);

  const lineColor =
    metric === 'latency'
      ? 'var(--bb-cyan)'
      : metric === 'peers'
      ? 'var(--bb-green)'
      : 'var(--bb-cyan)';

  return (
    <div
      data-testid="mini-metric-track"
      style={{
        borderBottom: '1px solid var(--bb-border)',
        background: 'var(--bb-black, #0a0a0f)',
      }}
    >
      {/* Header */}
      <div
        data-testid="mini-track-header"
        onClick={collapsible ? () => setCollapsed(!collapsed) : undefined}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 8px',
          cursor: collapsible ? 'pointer' : 'default',
          background: 'var(--bb-panel)',
          borderBottom: collapsed ? 'none' : '1px solid var(--bb-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {collapsible && (
            <span style={{ color: 'var(--bb-gray)', fontSize: '10px' }}>
              {collapsed ? '▶' : '▼'}
            </span>
          )}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--bb-amber)',
              fontWeight: 'bold',
            }}
          >
            {label.toUpperCase()}
          </span>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: 'var(--bb-gray)',
          }}
        >
          {summary}
        </span>
      </div>

      {/* Chart */}
      {!collapsed && (
        <svg
          data-testid="mini-metric-chart"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height }}
        >
          {/* Health segments */}
          {healthSegments &&
            healthSegments.map((seg, i) => (
              <rect
                key={i}
                x={seg.x}
                y={padding.top}
                width={Math.max(0.5, seg.width - 0.5)}
                height={chartHeight - padding.top - padding.bottom}
                fill={seg.color}
                opacity={0.6}
              />
            ))}

          {/* Bandwidth mirrored - network monitoring style */}
          {bandwidthPaths && (
            <>
              {/* Grid lines */}
              <line
                x1={padding.left}
                y1={chartHeight * 0.25}
                x2={chartWidth - padding.right}
                y2={chartHeight * 0.25}
                stroke="var(--bb-border)"
                strokeWidth="0.3"
                strokeDasharray="1,1"
                opacity={0.3}
              />
              <line
                x1={padding.left}
                y1={chartHeight / 2}
                x2={chartWidth - padding.right}
                y2={chartHeight / 2}
                stroke="var(--bb-gray)"
                strokeWidth="0.5"
                opacity={0.5}
              />
              <line
                x1={padding.left}
                y1={chartHeight * 0.75}
                x2={chartWidth - padding.right}
                y2={chartHeight * 0.75}
                stroke="var(--bb-border)"
                strokeWidth="0.3"
                strokeDasharray="1,1"
                opacity={0.3}
              />
              {/* Outbound (upload) - glow + line */}
              <path
                d={bandwidthPaths.outPath}
                fill="none"
                stroke={BANDWIDTH_COLORS.outbound.glow}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                opacity={0.4}
              />
              <path
                d={bandwidthPaths.outPath}
                fill="none"
                stroke={BANDWIDTH_COLORS.outbound.stroke}
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
              />
              {/* Inbound (download) - glow + line */}
              <path
                d={bandwidthPaths.inPath}
                fill="none"
                stroke={BANDWIDTH_COLORS.inbound.glow}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                opacity={0.4}
              />
              <path
                d={bandwidthPaths.inPath}
                fill="none"
                stroke={BANDWIDTH_COLORS.inbound.stroke}
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
              />
            </>
          )}

          {/* Line chart (latency, peers) */}
          {linePath && metric !== 'health' && metric !== 'bandwidth' && (
            <path
              d={linePath}
              fill="none"
              stroke={lineColor}
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      )}
    </div>
  );
}
