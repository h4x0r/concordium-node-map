'use client';

import { useMemo } from 'react';
import type { TimeRange } from '@/lib/timeline';
import type { NodeHistoryPoint, ComparisonNodeData } from '@/hooks/useDeepDiveData';

export type MetricType = 'health' | 'latency' | 'bandwidth' | 'peers';

// Node colors matching PRD spec
const NODE_COLORS = {
  primary: 'var(--bb-cyan)',
  comparison1: 'var(--bb-orange)',
  comparison2: 'var(--bb-green)',
};

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

export interface MetricTrackProps {
  label: string;
  metric: MetricType;
  range: TimeRange;
  primaryData: NodeHistoryPoint[];
  comparisonData: ComparisonNodeData[];
  height?: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  crosshairTimestamp?: number;
}

function getMetricValue(point: NodeHistoryPoint, metric: MetricType): number | null {
  switch (metric) {
    case 'latency':
      return point.avgPing;
    case 'peers':
      return point.peersCount;
    case 'bandwidth':
      return (point.bytesIn ?? 0) + (point.bytesOut ?? 0);
    case 'health':
      return point.healthStatus === 'healthy' ? 1 : point.healthStatus === 'lagging' ? 0.5 : 0;
    default:
      return null;
  }
}

function formatMetricValue(value: number | null, metric: MetricType): string {
  if (value === null) return '—';
  switch (metric) {
    case 'latency':
      return `${Math.round(value)}ms`;
    case 'peers':
      return String(Math.round(value));
    case 'bandwidth':
      return `${(value / 1024).toFixed(1)}KB/s`;
    case 'health':
      return value === 1 ? 'Healthy' : value === 0.5 ? 'Lagging' : 'Issue';
    default:
      return String(value);
  }
}

function computeSummary(data: NodeHistoryPoint[], metric: MetricType): string {
  if (data.length === 0) return '—';

  const values = data.map((d) => getMetricValue(d, metric)).filter((v): v is number => v !== null);
  if (values.length === 0) return '—';

  if (metric === 'health') {
    const healthy = values.filter((v) => v === 1).length;
    return `${Math.round((healthy / values.length) * 100)}% healthy`;
  }

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return formatMetricValue(avg, metric);
}

interface PathPoint {
  x: number;
  y: number;
}

function generateLinePath(points: PathPoint[]): string {
  if (points.length === 0) return '';
  return `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')}`;
}

function generateStepPath(points: PathPoint[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H ${points[i].x} V ${points[i].y}`;
  }
  return d;
}

export function MetricTrack({
  label,
  metric,
  range,
  primaryData,
  comparisonData,
  height = 80,
  collapsed,
  onToggleCollapse,
  crosshairTimestamp,
}: MetricTrackProps) {
  const duration = range.end - range.start;
  const chartWidth = 100; // viewBox width
  const chartHeight = 100; // viewBox height
  const padding = { top: 5, right: 5, bottom: 5, left: 5 };

  const allData = useMemo(() => {
    return [
      { nodeId: 'primary', data: primaryData, color: NODE_COLORS.primary },
      ...comparisonData.map((c, i) => ({
        nodeId: c.nodeId,
        data: c.data,
        color: i === 0 ? NODE_COLORS.comparison1 : NODE_COLORS.comparison2,
      })),
    ];
  }, [primaryData, comparisonData]);

  // Calculate Y scale based on all data
  const { yMin, yMax } = useMemo(() => {
    const allValues = allData.flatMap((d) =>
      d.data.map((p) => getMetricValue(p, metric)).filter((v): v is number => v !== null)
    );
    if (allValues.length === 0) return { yMin: 0, yMax: 100 };

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min || 1;
    return { yMin: min - range * 0.1, yMax: max + range * 0.1 };
  }, [allData, metric]);

  const timestampToX = (timestamp: number) => {
    const ratio = (timestamp - range.start) / duration;
    return padding.left + ratio * (chartWidth - padding.left - padding.right);
  };

  const valueToY = (value: number) => {
    const ratio = (value - yMin) / (yMax - yMin);
    return chartHeight - padding.bottom - ratio * (chartHeight - padding.top - padding.bottom);
  };

  // Generate paths for each node
  const paths = useMemo(() => {
    return allData.map(({ nodeId, data, color }) => {
      const points: PathPoint[] = data
        .map((d) => {
          const value = getMetricValue(d, metric);
          if (value === null) return null;
          return { x: timestampToX(d.timestamp), y: valueToY(value) };
        })
        .filter((p): p is PathPoint => p !== null);

      const pathD = metric === 'peers' ? generateStepPath(points) : generateLinePath(points);
      return { nodeId, pathD, color };
    });
  }, [allData, metric, range, yMin, yMax]);

  // Health track renders differently
  const healthSegments = useMemo(() => {
    if (metric !== 'health') return null;
    return primaryData.map((point, i) => {
      const nextTimestamp = primaryData[i + 1]?.timestamp ?? range.end;
      const x = timestampToX(point.timestamp);
      const width = timestampToX(nextTimestamp) - x;
      const color =
        point.healthStatus === 'healthy'
          ? 'var(--bb-green)'
          : point.healthStatus === 'lagging'
          ? 'var(--bb-orange)'
          : 'var(--bb-red)';
      return { x, width, color, status: point.healthStatus };
    });
  }, [metric, primaryData, range]);

  // Bandwidth mirrored paths
  const bandwidthPaths = useMemo(() => {
    if (metric !== 'bandwidth') return null;

    const centerY = chartHeight / 2;
    const halfHeight = (chartHeight - padding.top - padding.bottom) / 2;

    return allData.map(({ nodeId, data, color }) => {
      // Max value for scaling
      const maxBw = Math.max(
        ...data.map((d) => Math.max(d.bytesIn ?? 0, d.bytesOut ?? 0)),
        1
      );

      const outPoints: PathPoint[] = data.map((d) => ({
        x: timestampToX(d.timestamp),
        y: centerY - ((d.bytesOut ?? 0) / maxBw) * halfHeight * 0.9,
      }));

      const inPoints: PathPoint[] = data.map((d) => ({
        x: timestampToX(d.timestamp),
        y: centerY + ((d.bytesIn ?? 0) / maxBw) * halfHeight * 0.9,
      }));

      return {
        nodeId,
        outPath: generateLinePath(outPoints),
        inPath: generateLinePath(inPoints),
        color,
      };
    });
  }, [metric, allData, range, chartHeight, padding]);

  // Crosshair values
  const crosshairValues = useMemo(() => {
    if (crosshairTimestamp === undefined) return null;

    return allData.map(({ nodeId, data, color }) => {
      // Find closest data point
      const closest = data.reduce((prev, curr) =>
        Math.abs(curr.timestamp - crosshairTimestamp) <
        Math.abs(prev.timestamp - crosshairTimestamp)
          ? curr
          : prev
      );
      const value = getMetricValue(closest, metric);
      return { nodeId, value, color, formatted: formatMetricValue(value, metric) };
    });
  }, [crosshairTimestamp, allData, metric]);

  const summary = computeSummary(primaryData, metric);

  return (
    <div
      data-testid="metric-track"
      className="metric-track"
      style={{
        borderBottom: '1px solid var(--bb-border)',
      }}
    >
      {/* Header */}
      <div
        data-testid="track-header"
        onClick={onToggleCollapse}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 12px',
          cursor: 'pointer',
          background: 'var(--bb-panel)',
          borderBottom: collapsed ? 'none' : '1px solid var(--bb-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--bb-gray)', fontSize: '12px' }}>
            {collapsed ? '▶' : '▼'}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
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
            fontSize: '10px',
            color: 'var(--bb-gray)',
          }}
        >
          {summary}
        </span>
      </div>

      {/* Chart area */}
      {!collapsed && (
        <div style={{ position: 'relative', height }}>
          <svg
            data-testid="metric-chart"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: '100%' }}
          >
            {/* Health segments */}
            {healthSegments &&
              healthSegments.map((seg, i) => (
                <rect
                  key={i}
                  x={seg.x}
                  y={padding.top}
                  width={Math.max(0.5, seg.width)}
                  height={chartHeight - padding.top - padding.bottom}
                  fill={seg.color}
                  opacity={0.6}
                />
              ))}

            {/* Bandwidth mirrored paths - network monitoring style */}
            {bandwidthPaths && (
              <g>
                {/* Grid lines */}
                <line
                  x1={padding.left}
                  y1={chartHeight * 0.25}
                  x2={chartWidth - padding.right}
                  y2={chartHeight * 0.25}
                  stroke="var(--bb-border)"
                  strokeWidth="0.3"
                  strokeDasharray="2,2"
                  opacity={0.3}
                />
                <line
                  x1={padding.left}
                  y1={chartHeight / 2}
                  x2={chartWidth - padding.right}
                  y2={chartHeight / 2}
                  stroke="var(--bb-gray)"
                  strokeWidth="0.8"
                  opacity={0.5}
                />
                <line
                  x1={padding.left}
                  y1={chartHeight * 0.75}
                  x2={chartWidth - padding.right}
                  y2={chartHeight * 0.75}
                  stroke="var(--bb-border)"
                  strokeWidth="0.3"
                  strokeDasharray="2,2"
                  opacity={0.3}
                />
                {bandwidthPaths.map(({ nodeId, outPath, inPath }) => (
                  <g key={nodeId}>
                    {/* Outbound glow + line */}
                    <path
                      d={outPath}
                      fill="none"
                      stroke={BANDWIDTH_COLORS.outbound.glow}
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                      opacity={0.4}
                    />
                    <path
                      d={outPath}
                      fill="none"
                      stroke={BANDWIDTH_COLORS.outbound.stroke}
                      strokeWidth="1.2"
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                    />
                    {/* Inbound glow + line */}
                    <path
                      d={inPath}
                      fill="none"
                      stroke={BANDWIDTH_COLORS.inbound.glow}
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                      opacity={0.4}
                    />
                    <path
                      d={inPath}
                      fill="none"
                      stroke={BANDWIDTH_COLORS.inbound.stroke}
                      strokeWidth="1.2"
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                    />
                  </g>
                ))}
              </g>
            )}

            {/* Line/step chart paths (latency, peers) */}
            {metric !== 'health' &&
              metric !== 'bandwidth' &&
              paths.map(({ nodeId, pathD, color }) => (
                <path
                  key={nodeId}
                  d={pathD}
                  fill="none"
                  stroke={color}
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
          </svg>

          {/* Crosshair values overlay */}
          {crosshairValues && (
            <div
              style={{
                position: 'absolute',
                top: '4px',
                right: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {crosshairValues.map(({ nodeId, formatted, color }) => (
                <span
                  key={nodeId}
                  data-testid="crosshair-value"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color,
                    background: 'rgba(0,0,0,0.7)',
                    padding: '1px 4px',
                    borderRadius: '2px',
                  }}
                >
                  {formatted}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
