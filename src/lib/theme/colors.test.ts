/**
 * Theme Colors Tests
 *
 * Tests for centralized color definitions.
 */

import { describe, it, expect } from 'vitest';
import { CHART_COLORS, BANDWIDTH_COLORS } from './colors';

describe('CHART_COLORS', () => {
  it('has all required color keys', () => {
    expect(CHART_COLORS).toHaveProperty('green');
    expect(CHART_COLORS).toHaveProperty('amber');
    expect(CHART_COLORS).toHaveProperty('orange');
    expect(CHART_COLORS).toHaveProperty('cyan');
    expect(CHART_COLORS).toHaveProperty('red');
  });

  it('each color has stroke and fill properties', () => {
    for (const [key, colors] of Object.entries(CHART_COLORS)) {
      expect(colors).toHaveProperty('stroke');
      expect(colors).toHaveProperty('fill');
      expect(typeof colors.stroke).toBe('string');
      expect(typeof colors.fill).toBe('string');
    }
  });

  it('stroke values use CSS variables', () => {
    expect(CHART_COLORS.green.stroke).toBe('var(--bb-green)');
    expect(CHART_COLORS.amber.stroke).toBe('var(--bb-amber)');
    expect(CHART_COLORS.orange.stroke).toBe('var(--bb-orange)');
    expect(CHART_COLORS.cyan.stroke).toBe('var(--bb-cyan)');
    expect(CHART_COLORS.red.stroke).toBe('var(--bb-red)');
  });

  it('fill values use rgba for transparency', () => {
    for (const colors of Object.values(CHART_COLORS)) {
      expect(colors.fill).toMatch(/^rgba\(/);
    }
  });
});

describe('BANDWIDTH_COLORS', () => {
  it('has outbound and inbound keys', () => {
    expect(BANDWIDTH_COLORS).toHaveProperty('outbound');
    expect(BANDWIDTH_COLORS).toHaveProperty('inbound');
  });

  it('each direction has stroke, glow, and fill properties', () => {
    expect(BANDWIDTH_COLORS.outbound).toHaveProperty('stroke');
    expect(BANDWIDTH_COLORS.outbound).toHaveProperty('glow');
    expect(BANDWIDTH_COLORS.outbound).toHaveProperty('fill');

    expect(BANDWIDTH_COLORS.inbound).toHaveProperty('stroke');
    expect(BANDWIDTH_COLORS.inbound).toHaveProperty('glow');
    expect(BANDWIDTH_COLORS.inbound).toHaveProperty('fill');
  });

  it('outbound uses warm orange color', () => {
    expect(BANDWIDTH_COLORS.outbound.stroke).toBe('#ff9500');
  });

  it('inbound uses cool cyan color', () => {
    expect(BANDWIDTH_COLORS.inbound.stroke).toBe('#00d4ff');
  });

  it('colors are visually distinct (different hues)', () => {
    expect(BANDWIDTH_COLORS.outbound.stroke).not.toBe(BANDWIDTH_COLORS.inbound.stroke);
  });
});
