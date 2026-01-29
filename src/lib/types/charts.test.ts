/**
 * Chart Types Tests
 *
 * Tests for shared chart type definitions and constants.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HEALTH_THRESHOLDS,
  type MRTGDataPoint,
  type HealthThresholds,
} from './charts';

describe('MRTGDataPoint type', () => {
  it('accepts valid data point', () => {
    const point: MRTGDataPoint = {
      timestamp: 1706500000000,
      value: 95.5,
    };
    expect(point.timestamp).toBe(1706500000000);
    expect(point.value).toBe(95.5);
  });

  it('allows zero values', () => {
    const point: MRTGDataPoint = { timestamp: 0, value: 0 };
    expect(point.timestamp).toBe(0);
    expect(point.value).toBe(0);
  });

  it('allows negative values (for certain metrics)', () => {
    const point: MRTGDataPoint = { timestamp: 1706500000000, value: -10 };
    expect(point.value).toBe(-10);
  });
});

describe('HealthThresholds type', () => {
  it('accepts valid thresholds', () => {
    const thresholds: HealthThresholds = {
      green: 90,
      amber: 70,
      orange: 50,
    };
    expect(thresholds.green).toBeGreaterThan(thresholds.amber);
    expect(thresholds.amber).toBeGreaterThan(thresholds.orange);
  });
});

describe('DEFAULT_HEALTH_THRESHOLDS', () => {
  it('has expected default values', () => {
    expect(DEFAULT_HEALTH_THRESHOLDS.green).toBe(90);
    expect(DEFAULT_HEALTH_THRESHOLDS.amber).toBe(70);
    expect(DEFAULT_HEALTH_THRESHOLDS.orange).toBe(50);
  });

  it('maintains proper ordering (green > amber > orange)', () => {
    expect(DEFAULT_HEALTH_THRESHOLDS.green).toBeGreaterThan(DEFAULT_HEALTH_THRESHOLDS.amber);
    expect(DEFAULT_HEALTH_THRESHOLDS.amber).toBeGreaterThan(DEFAULT_HEALTH_THRESHOLDS.orange);
  });
});
