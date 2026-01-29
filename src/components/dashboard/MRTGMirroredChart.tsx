'use client';

import { useMemo } from 'react';
import type { MRTGDataPoint } from '@/lib/types/charts';
import { BANDWIDTH_COLORS } from '@/lib/theme/colors';

export interface MRTGMirroredChartProps {
  outboundData: MRTGDataPoint[];
  inboundData: MRTGDataPoint[];
  label: string;
  unit?: string;
  height?: number;
  showGrid?: boolean;
}

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

  // Generate bars for bandwidth visualization
  const { outboundBars, inboundBars, yMax } = useMemo(() => {
    if (outboundData.length === 0 && inboundData.length === 0) {
      return { outboundBars: [], inboundBars: [], yMax: 100 };
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
    const barCount = Math.max(outboundData.length, inboundData.length, 1);
    const barWidth = chartWidth / barCount;
    const barGap = barWidth * 0.1; // 10% gap between bars

    // Generate outbound bars (above center line)
    const outboundBars = outboundData.map((d, i) => {
      const x = padding.left + i * barWidth + barGap / 2;
      const barHeight = (d.value / yMax) * chartHeight;
      return {
        x,
        y: centerY - barHeight,
        width: barWidth - barGap,
        height: barHeight,
      };
    });

    // Generate inbound bars (below center line)
    const inboundBars = inboundData.map((d, i) => {
      const x = padding.left + i * barWidth + barGap / 2;
      const barHeight = (d.value / yMax) * chartHeight;
      return {
        x,
        y: centerY,
        width: barWidth - barGap,
        height: barHeight,
      };
    });

    return { outboundBars, inboundBars, yMax };
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

        {/* Outbound bars (above center) */}
        {outboundBars.map((bar, i) => (
          <rect
            key={`out-${i}`}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={Math.max(0.5, bar.height)}
            fill={BANDWIDTH_COLORS.outbound.stroke}
            opacity={0.85}
          />
        ))}

        {/* Inbound bars (below center) */}
        {inboundBars.map((bar, i) => (
          <rect
            key={`in-${i}`}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={Math.max(0.5, bar.height)}
            fill={BANDWIDTH_COLORS.inbound.stroke}
            opacity={0.85}
          />
        ))}

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
