/**
 * useResponsivePageSize - Calculate page size based on available container height
 *
 * Dynamically determines how many table rows can fit in the available space,
 * accounting for summary cards, headers, and pagination controls.
 */

import { useState, useEffect, useLayoutEffect, useCallback, RefObject } from 'react';

const ROW_HEIGHT = 41; // Height per table row (padding + content + border)
const MIN_ROWS = 5;    // Minimum rows to always show
const MAX_ROWS = 100;  // Maximum rows cap

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
  reservedHeight = 128, // Summary cards (~96) + section header with margin (~32)
  paginationHeight = 52, // Pagination margin (16) + padding (12) + content (~24)
  tableHeaderHeight = 24, // Table thead only
}: UseResponsivePageSizeOptions): number {
  const [pageSize, setPageSize] = useState(MIN_ROWS);
  const [containerReady, setContainerReady] = useState(false);

  const calculatePageSize = useCallback(() => {
    const container = containerRef.current;
    if (!container) return MIN_ROWS;

    const containerHeight = container.clientHeight;
    if (containerHeight === 0) return MIN_ROWS;

    const availableForRows = containerHeight - reservedHeight - paginationHeight - tableHeaderHeight;
    const calculatedRows = Math.floor(availableForRows / ROW_HEIGHT);

    return Math.max(MIN_ROWS, Math.min(MAX_ROWS, calculatedRows));
  }, [containerRef, reservedHeight, paginationHeight, tableHeaderHeight]);

  // Check for container availability using RAF polling
  useLayoutEffect(() => {
    let rafId: number;
    let attempts = 0;
    const maxAttempts = 50; // ~830ms max wait

    const checkContainer = () => {
      const container = containerRef.current;
      if (container && container.clientHeight > 0) {
        setContainerReady(true);
        setPageSize(calculatePageSize());
        return;
      }

      attempts++;
      if (attempts < maxAttempts) {
        rafId = requestAnimationFrame(checkContainer);
      }
    };

    checkContainer();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [containerRef, calculatePageSize]);

  // Set up ResizeObserver once container is ready
  useEffect(() => {
    if (!containerReady) return;

    const container = containerRef.current;
    if (!container) return;

    // Recalculate on mount
    setPageSize(calculatePageSize());

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
  }, [containerReady, containerRef, calculatePageSize]);

  return pageSize;
}
