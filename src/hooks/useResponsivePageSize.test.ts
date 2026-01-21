/**
 * Tests for useResponsivePageSize hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useResponsivePageSize } from './useResponsivePageSize';

describe('useResponsivePageSize', () => {
  let mockContainerRef: { current: HTMLDivElement | null };

  beforeEach(() => {
    mockContainerRef = { current: null };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns minimum rows when container has no height', () => {
    const { result } = renderHook(() =>
      useResponsivePageSize({ containerRef: mockContainerRef })
    );

    expect(result.current).toBe(5); // MIN_ROWS
  });

  it('returns minimum rows when container ref is null', () => {
    const { result } = renderHook(() =>
      useResponsivePageSize({ containerRef: { current: null } })
    );

    expect(result.current).toBe(5); // MIN_ROWS
  });

  it('calculates page size based on container height', () => {
    const mockDiv = document.createElement('div');
    Object.defineProperty(mockDiv, 'clientHeight', { value: 700 });
    mockContainerRef.current = mockDiv;

    const { result } = renderHook(() =>
      useResponsivePageSize({ containerRef: mockContainerRef })
    );

    // Available: 700 - 128 (reserved) - 52 (pagination) - 24 (header) = 496
    // Rows: 496 / 41 = 12.0 → 12 rows
    expect(result.current).toBe(12);
  });

  it('respects minimum rows', () => {
    const mockDiv = document.createElement('div');
    Object.defineProperty(mockDiv, 'clientHeight', { value: 200 }); // Very small
    mockContainerRef.current = mockDiv;

    const { result } = renderHook(() =>
      useResponsivePageSize({ containerRef: mockContainerRef })
    );

    expect(result.current).toBe(5); // MIN_ROWS
  });

  it('respects maximum rows', () => {
    const mockDiv = document.createElement('div');
    Object.defineProperty(mockDiv, 'clientHeight', { value: 5000 }); // Very large
    mockContainerRef.current = mockDiv;

    const { result } = renderHook(() =>
      useResponsivePageSize({ containerRef: mockContainerRef })
    );

    expect(result.current).toBe(100); // MAX_ROWS
  });

  it('accepts custom reserved height', () => {
    const mockDiv = document.createElement('div');
    Object.defineProperty(mockDiv, 'clientHeight', { value: 600 });
    mockContainerRef.current = mockDiv;

    const { result } = renderHook(() =>
      useResponsivePageSize({
        containerRef: mockContainerRef,
        reservedHeight: 100, // Less reserved space
      })
    );

    // Available: 600 - 100 (custom reserved) - 52 (pagination) - 24 (header) = 424
    // Rows: 424 / 41 = 10.3 → 10 rows
    expect(result.current).toBe(10);
  });
});
