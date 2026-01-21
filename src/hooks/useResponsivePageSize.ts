/**
 * useResponsivePageSize - Calculate page size based on available container height
 *
 * Dynamically determines how many table rows can fit in the available space,
 * accounting for summary cards, headers, and pagination controls.
 */

import { useState, useEffect, useCallback, RefObject } from 'react';

const ROW_HEIGHT = 40; // Approximate height per table row in pixels
const MIN_ROWS = 5;    // Minimum rows to always show
const MAX_ROWS = 50;   // Maximum rows cap

interface UseResponsivePageSizeOptions {
  /** Reference to the container element */
  containerRef: RefObject<HTMLElement | null>;
  /** Height reserved for elements above the table (summary cards, section header) */
  reservedHeight?: number;
  /** Height of pagination controls */
  paginationHeight?: number;
  /** Height of table header row */
  tableHeaderHeight?: number;
}

export function useResponsivePageSize({
  containerRef,
  reservedHeight = 180, // Summary cards + section header
  paginationHeight = 48,
  tableHeaderHeight = 44,
}: UseResponsivePageSizeOptions): number {
  const [pageSize, setPageSize] = useState(MIN_ROWS);

  const calculatePageSize = useCallback(() => {
    const container = containerRef.current;
    if (!container) return MIN_ROWS;

    const containerHeight = container.clientHeight;
    const availableForRows = containerHeight - reservedHeight - paginationHeight - tableHeaderHeight;
    const calculatedRows = Math.floor(availableForRows / ROW_HEIGHT);

    return Math.max(MIN_ROWS, Math.min(MAX_ROWS, calculatedRows));
  }, [containerRef, reservedHeight, paginationHeight, tableHeaderHeight]);

  useEffect(() => {
    // Initial calculation
    setPageSize(calculatePageSize());

    // Set up ResizeObserver for container size changes
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      setPageSize(calculatePageSize());
    });

    resizeObserver.observe(container);

    // Also listen for window resize as fallback
    const handleResize = () => setPageSize(calculatePageSize());
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [containerRef, calculatePageSize]);

  return pageSize;
}
