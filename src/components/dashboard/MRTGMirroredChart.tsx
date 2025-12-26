'use client';

import { useMemo } from 'react';

export interface MRTGDataPoint {
  timestamp: number;
  value: number;
}

export interface MRTGMirroredChartProps {
  outboundData: MRTGDataPoint[];
  inboundData: MRTGDataPoint[];
  label: string;
  unit?: string;
  height?: number;
  showGrid?: boolean;
}

// Network monitoring aesthetic: contrasting colors for up/down traffic
// Outbound (upload, going UP) = warm orange/amber
// Inbound (download, going DOWN) = cool cyan
const BANDWIDTH_COLORS = {
  outbound: {
    stroke: '#ff9500', // warm orange
    glow: 'rgba(255, 149, 0, 0.6)',
    fill: 'rgba(255, 149, 0, 0.15)',
  },
  inbound: {
    stroke: '#00d4ff', // cool cyan
    glow: 'rgba(0, 212, 255, 0.6)',
    fill: 'rgba(0, 212, 255, 0.15)',
  },
};

function formatValue(value: number, unit?: string): string {
  if (unit === 'KB/s') return `${value.toFixed(0)}`;
  if (unit === 'MB/s') return `${value.toFixed(1)}`;
  return value.toFixed(0);
}

export function MRTGMirroredChart({
  outboundData,
  inboundData,
  label,
  unit = '',
  height = 100,
  showGrid = true,
}: MRTGMirroredChartProps) {
  // Use fixed viewBox coordinates (100x100) for consistent math
  // The SVG will stretch to fill container via preserveAspectRatio="none"
  const viewBoxHeight = 100;
  const padding = { top: 5, right: 45, bottom: 5, left: 8 };
  // Center Y at exactly 50% of viewBox height
  const centerY = 50;

  const latestOutbound = outboundData.length > 0 ? outboundData[outboundData.length - 1].value : 0;
  const latestInbound = inboundData.length > 0 ? inboundData[inboundData.length - 1].value : 0;

  const { outboundPath, inboundPath, outboundArea, inboundArea, yMax } = useMemo(() => {
    if (outboundData.length === 0 && inboundData.length === 0) {
      return {
        outboundPath: '',
        inboundPath: '',
        outboundArea: '',
        inboundArea: '',
        yMax: 100,
      };
    }

    // Find max value across both datasets for symmetric scaling
    const allValues = [
      ...outboundData.map(d => d.value),
      ...inboundData.map(d => d.value),
    ];
    const dataMax = Math.max(...allValues, 1);
    const yMax = dataMax * 1.1; // 10% padding

    const chartHeight = (viewBoxHeight - padding.top - padding.bottom) / 2;
    const chartWidth = 100 - padding.left - padding.right;

    // Generate outbound path (above center line)
    const outboundPoints = outboundData.map((d, i) => {
      const x = padding.left + (i / Math.max(1, outboundData.length - 1)) * chartWidth;
      const y = centerY - (d.value / yMax) * chartHeight;
      return { x, y };
    });

    // Generate inbound path (below center line)
    const inboundPoints = inboundData.map((d, i) => {
      const x = padding.left + (i / Math.max(1, inboundData.length - 1)) * chartWidth;
      const y = centerY + (d.value / yMax) * chartHeight;
      return { x, y };
    });

    const outboundPath = outboundPoints.length > 0
      ? `M ${outboundPoints.map(p => `${p.x},${p.y}`).join(' L ')}`
      : '';

    const inboundPath = inboundPoints.length > 0
      ? `M ${inboundPoints.map(p => `${p.x},${p.y}`).join(' L ')}`
      : '';

    // Area fills
    const outboundArea = outboundPoints.length > 0
      ? `M ${padding.left},${centerY} L ${outboundPoints.map(p => `${p.x},${p.y}`).join(' L ')} L ${padding.left + chartWidth},${centerY} Z`
      : '';

    const inboundArea = inboundPoints.length > 0
      ? `M ${padding.left},${centerY} L ${inboundPoints.map(p => `${p.x},${p.y}`).join(' L ')} L ${padding.left + chartWidth},${centerY} Z`
      : '';

    return { outboundPath, inboundPath, outboundArea, inboundArea, yMax };
  }, [outboundData, inboundData, viewBoxHeight, centerY, padding.top, padding.bottom, padding.left, padding.right]);

  // Calculate quarter grid positions
  const chartHeight = (viewBoxHeight - padding.top - padding.bottom) / 2;
  const quarterUp = centerY - chartHeight * 0.5;
  const quarterDown = centerY + chartHeight * 0.5;

  return (
    <div className="bb-mrtg-chart" style={{ height }}>
      {/* Header */}
      <div className="bb-mrtg-header">
        <span className="bb-mrtg-label">{label}</span>
        <div className="bb-mrtg-values" style={{ display: 'flex', gap: '12px', fontSize: '10px' }}>
          <span style={{ color: BANDWIDTH_COLORS.outbound.stroke, fontWeight: 600 }}>
            ▲ OUT {formatValue(latestOutbound, unit)}{unit}
          </span>
          <span style={{ color: BANDWIDTH_COLORS.inbound.stroke, fontWeight: 600 }}>
            ▼ IN {formatValue(latestInbound, unit)}{unit}
          </span>
        </div>
      </div>

      {/* Chart SVG */}
      <svg
        viewBox={`0 0 100 ${viewBoxHeight}`}
        preserveAspectRatio="none"
        className="bb-mrtg-svg"
        style={{ height: 'calc(100% - 22px)' }}
      >
        {/* Gradient definitions for area fills */}
        <defs>
          <linearGradient id="outboundGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BANDWIDTH_COLORS.outbound.stroke} stopOpacity="0.3" />
            <stop offset="100%" stopColor={BANDWIDTH_COLORS.outbound.stroke} stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="inboundGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BANDWIDTH_COLORS.inbound.stroke} stopOpacity="0.05" />
            <stop offset="100%" stopColor={BANDWIDTH_COLORS.inbound.stroke} stopOpacity="0.3" />
          </linearGradient>
          {/* Glow filter for lines */}
          <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {showGrid && (
          <g className="bb-mrtg-grid">
            {/* Top boundary */}
            <line
              x1={padding.left}
              y1={padding.top}
              x2={100 - padding.right}
              y2={padding.top}
              stroke="var(--bb-border)"
              strokeWidth="0.3"
              opacity={0.5}
            />
            {/* Quarter line up */}
            <line
              x1={padding.left}
              y1={quarterUp}
              x2={100 - padding.right}
              y2={quarterUp}
              stroke="var(--bb-border)"
              strokeWidth="0.3"
              strokeDasharray="2,2"
              opacity={0.3}
            />
            {/* Center line (origin) - prominent */}
            <line
              x1={padding.left}
              y1={centerY}
              x2={100 - padding.right}
              y2={centerY}
              stroke="var(--bb-gray)"
              strokeWidth="0.8"
              opacity={0.6}
            />
            {/* Quarter line down */}
            <line
              x1={padding.left}
              y1={quarterDown}
              x2={100 - padding.right}
              y2={quarterDown}
              stroke="var(--bb-border)"
              strokeWidth="0.3"
              strokeDasharray="2,2"
              opacity={0.3}
            />
            {/* Bottom boundary */}
            <line
              x1={padding.left}
              y1={viewBoxHeight - padding.bottom}
              x2={100 - padding.right}
              y2={viewBoxHeight - padding.bottom}
              stroke="var(--bb-border)"
              strokeWidth="0.3"
              opacity={0.5}
            />
          </g>
        )}

        {/* Outbound area fill (above center) */}
        <path
          d={outboundArea}
          fill="url(#outboundGradient)"
        />

        {/* Inbound area fill (below center) */}
        <path
          d={inboundArea}
          fill="url(#inboundGradient)"
        />

        {/* Outbound line with glow */}
        <path
          d={outboundPath}
          fill="none"
          stroke={BANDWIDTH_COLORS.outbound.glow}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          opacity={0.5}
        />
        <path
          d={outboundPath}
          fill="none"
          stroke={BANDWIDTH_COLORS.outbound.stroke}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Inbound line with glow */}
        <path
          d={inboundPath}
          fill="none"
          stroke={BANDWIDTH_COLORS.inbound.glow}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          opacity={0.5}
        />
        <path
          d={inboundPath}
          fill="none"
          stroke={BANDWIDTH_COLORS.inbound.stroke}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Y-axis labels with direction indicators */}
        <text
          x={100 - padding.right + 2}
          y={padding.top + 3}
          className="bb-mrtg-axis-label"
          textAnchor="start"
          fill={BANDWIDTH_COLORS.outbound.stroke}
        >
          ▲{formatValue(yMax, unit)}
        </text>
        <text
          x={100 - padding.right + 2}
          y={centerY + 1}
          className="bb-mrtg-axis-label"
          textAnchor="start"
          fill="var(--bb-gray)"
        >
          0
        </text>
        <text
          x={100 - padding.right + 2}
          y={viewBoxHeight - padding.bottom}
          className="bb-mrtg-axis-label"
          textAnchor="start"
          fill={BANDWIDTH_COLORS.inbound.stroke}
        >
          ▼{formatValue(yMax, unit)}
        </text>
      </svg>
    </div>
  );
}
