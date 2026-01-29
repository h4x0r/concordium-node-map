/**
 * Centralized color definitions for charts and visualizations
 *
 * All chart colors are defined here for consistency across components.
 * Uses CSS variables for theme compatibility.
 */

/**
 * Health status colors for MRTG-style charts
 */
export const CHART_COLORS = {
  green: { stroke: 'var(--bb-green)', fill: 'rgba(0, 204, 102, 0.2)' },
  amber: { stroke: 'var(--bb-amber)', fill: 'rgba(255, 204, 0, 0.15)' },
  orange: { stroke: 'var(--bb-orange)', fill: 'rgba(255, 102, 0, 0.15)' },
  cyan: { stroke: 'var(--bb-cyan)', fill: 'rgba(102, 204, 255, 0.15)' },
  red: { stroke: 'var(--bb-red)', fill: 'rgba(255, 68, 68, 0.15)' },
} as const;

/**
 * Bandwidth colors for network traffic visualization
 * Network monitoring aesthetic: contrasting colors for up/down traffic
 * - Outbound (upload, going UP) = warm orange/amber
 * - Inbound (download, going DOWN) = cool cyan
 */
export const BANDWIDTH_COLORS = {
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
} as const;

/**
 * Type for chart color keys
 */
export type ChartColorKey = keyof typeof CHART_COLORS;

/**
 * Type for bandwidth direction keys
 */
export type BandwidthDirection = keyof typeof BANDWIDTH_COLORS;
