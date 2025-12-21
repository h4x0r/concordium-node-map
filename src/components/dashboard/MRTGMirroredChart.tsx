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

const COLORS = {
  outbound: { stroke: 'var(--bb-cyan)', fill: 'rgba(102, 204, 255, 0.2)' },
  inbound: { stroke: 'var(--bb-orange)', fill: 'rgba(255, 102, 0, 0.15)' },
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
  const padding = { top: 8, right: 45, bottom: 8, left: 8 };
  const centerY = height / 2;

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

    const chartHeight = (height - padding.top - padding.bottom) / 2;
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
  }, [outboundData, inboundData, height, centerY, padding.top, padding.bottom, padding.left, padding.right]);

  return (
    <div className="bb-mrtg-mirrored" style={{ height }}>
      {/* Header */}
      <div className="bb-mrtg-header">
        <span className="bb-mrtg-label">{label}</span>
        <div className="bb-mrtg-values" style={{ display: 'flex', gap: '8px', fontSize: '10px' }}>
          <span style={{ color: COLORS.outbound.stroke }}>
            OUT: {formatValue(latestOutbound, unit)}{unit}
          </span>
          <span style={{ color: COLORS.inbound.stroke }}>
            IN: {formatValue(latestInbound, unit)}{unit}
          </span>
        </div>
      </div>

      {/* Chart SVG */}
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="bb-mrtg-svg"
      >
        {/* Grid lines */}
        {showGrid && (
          <g className="bb-mrtg-grid">
            {/* Top grid line */}
            <line
              x1={padding.left}
              y1={padding.top}
              x2={100 - padding.right}
              y2={padding.top}
              stroke="var(--bb-grid)"
              strokeWidth="0.3"
              strokeDasharray="1,1"
            />
            {/* Center line (origin) - prominent */}
            <line
              x1={padding.left}
              y1={centerY}
              x2={100 - padding.right}
              y2={centerY}
              stroke="var(--bb-gray)"
              strokeWidth="1"
              opacity={0.8}
            />
            {/* Bottom grid line */}
            <line
              x1={padding.left}
              y1={height - padding.bottom}
              x2={100 - padding.right}
              y2={height - padding.bottom}
              stroke="var(--bb-grid)"
              strokeWidth="0.3"
              strokeDasharray="1,1"
            />
          </g>
        )}

        {/* Outbound area (above center) */}
        <path
          d={outboundArea}
          fill={COLORS.outbound.fill}
          opacity={0.5}
        />

        {/* Inbound area (below center) */}
        <path
          d={inboundArea}
          fill={COLORS.inbound.fill}
          opacity={0.5}
        />

        {/* Outbound line */}
        <path
          d={outboundPath}
          fill="none"
          stroke={COLORS.outbound.stroke}
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
        />

        {/* Inbound line */}
        <path
          d={inboundPath}
          fill="none"
          stroke={COLORS.inbound.stroke}
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
        />

        {/* Y-axis labels with direction indicators */}
        <text
          x={100 - padding.right + 2}
          y={padding.top + 3}
          className="bb-mrtg-axis-label"
          textAnchor="start"
          fill={COLORS.outbound.stroke}
        >
          ↑{formatValue(yMax, unit)}
        </text>
        <text
          x={100 - padding.right + 2}
          y={centerY + 1}
          className="bb-mrtg-axis-label"
          textAnchor="start"
        >
          0
        </text>
        <text
          x={100 - padding.right + 2}
          y={height - padding.bottom}
          className="bb-mrtg-axis-label"
          textAnchor="start"
          fill={COLORS.inbound.stroke}
        >
          ↓{formatValue(yMax, unit)}
        </text>
      </svg>
    </div>
  );
}
