/**
 * Shared chart type definitions
 *
 * Centralized types for MRTG-style charts and metrics visualization.
 */

/**
 * Single data point for time-series charts
 */
export interface MRTGDataPoint {
  timestamp: number;
  value: number;
}

/**
 * Thresholds for health-based coloring
 * Values define the minimum percentage for each color tier:
 * - >= green: green
 * - >= amber: amber
 * - >= orange: orange
 * - < orange: red
 */
export interface HealthThresholds {
  green: number;
  amber: number;
  orange: number;
}

/**
 * Default health thresholds (used by MRTGChart)
 */
export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  green: 90,
  amber: 70,
  orange: 50,
};
