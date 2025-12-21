'use client';

import { useMemo } from 'react';

export interface MRTGDataPoint {
  timestamp: number;
  value: number;
}

export interface MRTGChartProps {
  data: MRTGDataPoint[];
  label: string;
  unit?: string;
  color?: 'green' | 'amber' | 'orange' | 'cyan' | 'red' | 'auto';
  min?: number;
  max?: number;
  height?: number;
  showGrid?: boolean;
  showLabels?: boolean;
  fillOpacity?: number;
  /** Optional raw value to display alongside health score */
  rawValue?: number;
  /** Unit for raw value display */
  rawUnit?: string;
}

const COLOR_MAP = {
  green: { stroke: 'var(--bb-green)', fill: 'rgba(0, 204, 102, 0.2)' },
  amber: { stroke: 'var(--bb-amber)', fill: 'rgba(255, 204, 0, 0.15)' },
  orange: { stroke: 'var(--bb-orange)', fill: 'rgba(255, 102, 0, 0.15)' },
  cyan: { stroke: 'var(--bb-cyan)', fill: 'rgba(102, 204, 255, 0.15)' },
  red: { stroke: 'var(--bb-red)', fill: 'rgba(255, 68, 68, 0.15)' },
};

/**
 * Determine color based on health value (0-100 scale)
 * >= 90: green (healthy)
 * >= 70: amber (degraded)
 * >= 50: orange (warning)
 * < 50: red (critical)
 */
function getHealthColor(value: number): 'green' | 'amber' | 'orange' | 'red' {
  if (value >= 90) return 'green';
  if (value >= 70) return 'amber';
  if (value >= 50) return 'orange';
  return 'red';
}

function formatTimeLabel(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatValue(value: number, unit?: string): string {
  if (unit === '%') return `${value.toFixed(0)}%`;
  if (unit === 'ms') return `${value.toFixed(0)}ms`;
  if (unit === 'blks') return `${value.toFixed(0)}`;
  return value.toFixed(1);
}

export function MRTGChart({
  data,
  label,
  unit = '',
  color = 'auto',
  min: minProp,
  max: maxProp,
  height = 100,
  showGrid = true,
  showLabels = true,
  fillOpacity = 0.2,
  rawValue,
  rawUnit,
}: MRTGChartProps) {
  const chartWidth = 100; // percentage
  const padding = { top: 8, right: 40, bottom: 20, left: 8 };
  const latestValue = data.length > 0 ? data[data.length - 1].value : 0;
  const effectiveColor = color === 'auto' ? getHealthColor(latestValue) : color;
  const colors = COLOR_MAP[effectiveColor];

  const { points, pathD, areaD, yMin, yMax, yTicks, timeLabels } = useMemo(() => {
    if (data.length === 0) {
      return {
        points: [],
        pathD: '',
        areaD: '',
        yMin: 0,
        yMax: 100,
        yTicks: [0, 50, 100],
        timeLabels: []
      };
    }

    // Calculate bounds
    const values = data.map(d => d.value);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);

    // Use props or auto-calculate with padding
    const yMin = minProp ?? Math.max(0, dataMin - (dataMax - dataMin) * 0.1);
    const yMax = maxProp ?? (dataMax + (dataMax - dataMin) * 0.1 || 100);
    const yRange = yMax - yMin || 1;

    // Generate Y-axis ticks (3 ticks)
    const yTicks = [yMin, yMin + yRange / 2, yMax];

    // Calculate chart dimensions
    const chartHeight = height - padding.top - padding.bottom;
    const chartInnerWidth = 100 - padding.left - padding.right;

    // Map data to points
    const points = data.map((d, i) => {
      const x = padding.left + (i / Math.max(1, data.length - 1)) * chartInnerWidth;
      const y = padding.top + chartHeight - ((d.value - yMin) / yRange) * chartHeight;
      return { x, y, ...d };
    });

    // Create SVG path for line
    const pathD = points.length > 0
      ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`
      : '';

    // Create SVG path for filled area
    const areaD = points.length > 0
      ? `M ${padding.left},${padding.top + chartHeight} L ${points.map(p => `${p.x},${p.y}`).join(' L ')} L ${padding.left + chartInnerWidth},${padding.top + chartHeight} Z`
      : '';

    // Generate time labels (start, middle, end)
    const timeLabels = data.length > 2
      ? [
          { x: padding.left, label: formatTimeLabel(data[0].timestamp) },
          { x: padding.left + chartInnerWidth / 2, label: formatTimeLabel(data[Math.floor(data.length / 2)].timestamp) },
          { x: padding.left + chartInnerWidth, label: formatTimeLabel(data[data.length - 1].timestamp) },
        ]
      : [];

    return { points, pathD, areaD, yMin, yMax, yTicks, timeLabels };
  }, [data, minProp, maxProp, height, padding.top, padding.bottom, padding.left, padding.right]);

  const chartHeight = height - padding.top - padding.bottom;

  return (
    <div className="bb-mrtg-chart" style={{ height }}>
      {/* Label */}
      <div className="bb-mrtg-header">
        <span className="bb-mrtg-label">{label}</span>
        <div className="bb-mrtg-values">
          <span className="bb-mrtg-value" style={{ color: colors.stroke }}>
            {formatValue(latestValue, unit)}
          </span>
          {rawValue !== undefined && rawUnit && (
            <span className="bb-mrtg-raw">
              ({rawValue}{rawUnit})
            </span>
          )}
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
            {/* Horizontal grid lines */}
            {yTicks.map((tick, i) => {
              const y = padding.top + chartHeight - ((tick - yMin) / (yMax - yMin || 1)) * chartHeight;
              return (
                <line
                  key={`h-${i}`}
                  x1={padding.left}
                  y1={y}
                  x2={100 - padding.right}
                  y2={y}
                  stroke="var(--bb-grid)"
                  strokeWidth="0.3"
                  strokeDasharray="1,1"
                />
              );
            })}
            {/* Vertical grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
              const x = padding.left + ratio * (100 - padding.left - padding.right);
              return (
                <line
                  key={`v-${i}`}
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={height - padding.bottom}
                  stroke="var(--bb-grid)"
                  strokeWidth="0.3"
                  strokeDasharray="1,1"
                />
              );
            })}
          </g>
        )}

        {/* Filled area */}
        <path
          d={areaD}
          fill={colors.fill}
          opacity={fillOpacity}
        />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke={colors.stroke}
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
        />

        {/* Current value dot */}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r="1.5"
            fill={colors.stroke}
          />
        )}

        {/* Y-axis labels */}
        {showLabels && yTicks.map((tick, i) => {
          const y = padding.top + chartHeight - ((tick - yMin) / (yMax - yMin || 1)) * chartHeight;
          return (
            <text
              key={`y-${i}`}
              x={100 - padding.right + 2}
              y={y + 1}
              className="bb-mrtg-axis-label"
              textAnchor="start"
            >
              {formatValue(tick, unit)}
            </text>
          );
        })}
      </svg>

      {/* Time labels (rendered as HTML for better text rendering) */}
      {showLabels && timeLabels.length > 0 && (
        <div className="bb-mrtg-time-axis">
          {timeLabels.map((tl, i) => (
            <span
              key={i}
              className="bb-mrtg-time-label"
              style={{ left: `${tl.x}%` }}
            >
              {tl.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Multi-line MRTG chart for comparing multiple metrics
 */
export interface MRTGMultiChartProps {
  series: Array<{
    data: MRTGDataPoint[];
    label: string;
    color: 'green' | 'amber' | 'orange' | 'cyan' | 'red';
  }>;
  height?: number;
  showGrid?: boolean;
}

export function MRTGMultiChart({
  series,
  height = 120,
  showGrid = true,
}: MRTGMultiChartProps) {
  const padding = { top: 8, right: 8, bottom: 20, left: 8 };

  const { paths, yMin, yMax, timeLabels } = useMemo(() => {
    if (series.length === 0 || series.every(s => s.data.length === 0)) {
      return { paths: [], yMin: 0, yMax: 100, timeLabels: [] };
    }

    // Get all values for bounds
    const allValues = series.flatMap(s => s.data.map(d => d.value));
    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    const yMin = Math.max(0, dataMin - (dataMax - dataMin) * 0.1);
    const yMax = dataMax + (dataMax - dataMin) * 0.1 || 100;
    const yRange = yMax - yMin || 1;

    const chartHeight = height - padding.top - padding.bottom;
    const chartInnerWidth = 100 - padding.left - padding.right;

    // Generate paths for each series
    const paths = series.map(s => {
      const points = s.data.map((d, i) => {
        const x = padding.left + (i / Math.max(1, s.data.length - 1)) * chartInnerWidth;
        const y = padding.top + chartHeight - ((d.value - yMin) / yRange) * chartHeight;
        return { x, y };
      });

      const pathD = points.length > 0
        ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`
        : '';

      return {
        ...s,
        pathD,
        colors: COLOR_MAP[s.color],
      };
    });

    // Time labels from first series
    const firstData = series[0]?.data || [];
    const timeLabels = firstData.length > 2
      ? [
          { x: padding.left, label: formatTimeLabel(firstData[0].timestamp) },
          { x: padding.left + chartInnerWidth, label: formatTimeLabel(firstData[firstData.length - 1].timestamp) },
        ]
      : [];

    return { paths, yMin, yMax, timeLabels };
  }, [series, height]);

  const chartHeight = height - padding.top - padding.bottom;

  return (
    <div className="bb-mrtg-chart" style={{ height }}>
      {/* Legend */}
      <div className="bb-mrtg-legend">
        {series.map((s, i) => (
          <span key={i} className="bb-mrtg-legend-item">
            <span
              className="bb-mrtg-legend-dot"
              style={{ background: COLOR_MAP[s.color].stroke }}
            />
            {s.label}
          </span>
        ))}
      </div>

      {/* Chart SVG */}
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="bb-mrtg-svg"
      >
        {/* Grid */}
        {showGrid && (
          <g className="bb-mrtg-grid">
            {[0, 0.5, 1].map((ratio, i) => {
              const y = padding.top + ratio * chartHeight;
              return (
                <line
                  key={`h-${i}`}
                  x1={padding.left}
                  y1={y}
                  x2={100 - padding.right}
                  y2={y}
                  stroke="var(--bb-grid)"
                  strokeWidth="0.3"
                  strokeDasharray="1,1"
                />
              );
            })}
          </g>
        )}

        {/* Lines */}
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.pathD}
            fill="none"
            stroke={p.colors.stroke}
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* Time axis */}
      {timeLabels.length > 0 && (
        <div className="bb-mrtg-time-axis">
          {timeLabels.map((tl, i) => (
            <span
              key={i}
              className="bb-mrtg-time-label"
              style={{ left: `${tl.x}%` }}
            >
              {tl.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
