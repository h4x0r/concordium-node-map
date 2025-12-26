'use client';

import { useRef, useState, useCallback, useMemo } from 'react';
import type { TimeRange } from '@/lib/timeline';

export interface TimelineRulerProps {
  range: TimeRange;
  bounds?: TimeRange;
  onZoom: (cursorRatio: number, direction: 'in' | 'out') => void;
  onPan: (delta: number) => void;
  onSetRange?: (range: TimeRange) => void;
}

interface DragState {
  startX: number;
  startRange: TimeRange;
}

interface EdgeDragState {
  edge: 'left' | 'right';
  startX: number;
  startRange: TimeRange;
}

/**
 * Format a timestamp for display based on the visible range duration
 */
function formatTimestamp(timestamp: number, rangeDuration: number): string {
  const date = new Date(timestamp);
  const DAY = 24 * 60 * 60 * 1000;

  if (rangeDuration <= 6 * 60 * 60 * 1000) {
    // <= 6 hours: show HH:MM
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } else if (rangeDuration <= 3 * DAY) {
    // <= 3 days: show day HH:MM
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } else {
    // > 3 days: show date
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}

/**
 * Generate tick marks for the timeline
 */
function generateTicks(range: TimeRange, width: number): number[] {
  const duration = range.end - range.start;
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  // Determine tick interval based on duration
  let interval: number;
  if (duration <= 2 * HOUR) {
    interval = 15 * 60 * 1000; // 15 minutes
  } else if (duration <= 6 * HOUR) {
    interval = 30 * 60 * 1000; // 30 minutes
  } else if (duration <= DAY) {
    interval = HOUR; // 1 hour
  } else if (duration <= 3 * DAY) {
    interval = 3 * HOUR; // 3 hours
  } else if (duration <= 7 * DAY) {
    interval = 6 * HOUR; // 6 hours
  } else {
    interval = DAY; // 1 day
  }

  // Generate ticks aligned to interval boundaries
  const firstTick = Math.ceil(range.start / interval) * interval;
  const ticks: number[] = [];
  for (let t = firstTick; t <= range.end; t += interval) {
    ticks.push(t);
  }
  return ticks;
}

export function TimelineRuler({
  range,
  bounds,
  onZoom,
  onPan,
  onSetRange,
}: TimelineRulerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursorX, setCursorX] = useState<number | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [edgeDragState, setEdgeDragState] = useState<EdgeDragState | null>(null);

  const duration = range.end - range.start;
  const ticks = useMemo(() => generateTicks(range, 800), [range]);

  const timestampToX = useCallback(
    (timestamp: number) => {
      if (!containerRef.current) return 0;
      const width = containerRef.current.offsetWidth;
      return ((timestamp - range.start) / duration) * width;
    },
    [range, duration]
  );

  const xToRatio = useCallback(
    (x: number) => {
      if (!containerRef.current) return 0.5;
      const rect = containerRef.current.getBoundingClientRect();
      return Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    },
    []
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const ratio = xToRatio(e.clientX);
      const direction = e.deltaY < 0 ? 'in' : 'out';
      onZoom(ratio, direction);
    },
    [onZoom, xToRatio]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setCursorX(x);

      // Handle edge dragging
      if (edgeDragState && onSetRange) {
        const deltaX = e.clientX - edgeDragState.startX;
        const width = rect.width || 800; // Use reasonable default for test environments
        const rangeDuration = edgeDragState.startRange.end - edgeDragState.startRange.start;
        const deltaTime = (deltaX / width) * rangeDuration;

        if (edgeDragState.edge === 'left') {
          const newStart = edgeDragState.startRange.start + deltaTime;
          // Ensure minimum range of 1 minute and don't go past end
          const minRange = 60 * 1000;
          if (newStart < edgeDragState.startRange.end - minRange) {
            onSetRange({ start: newStart, end: edgeDragState.startRange.end });
          }
        } else {
          const newEnd = edgeDragState.startRange.end + deltaTime;
          // Ensure minimum range of 1 minute and don't go before start
          const minRange = 60 * 1000;
          if (newEnd > edgeDragState.startRange.start + minRange) {
            onSetRange({ start: edgeDragState.startRange.start, end: newEnd });
          }
        }
        return; // Don't pan while dragging edges
      }

      if (dragState) {
        const deltaX = e.clientX - dragState.startX;
        const width = rect.width;
        const deltaTime = -(deltaX / width) * duration;
        onPan(deltaTime);
      }
    },
    [dragState, edgeDragState, duration, onPan, onSetRange]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setDragState({
        startX: e.clientX,
        startRange: range,
      });
    },
    [range]
  );

  const handleMouseUp = useCallback(() => {
    setDragState(null);
    setEdgeDragState(null);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setCursorX(null);
    setDragState(null);
    setEdgeDragState(null);
  }, []);

  const handleEdgeMouseDown = useCallback(
    (edge: 'left' | 'right') => (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering pan drag
      setEdgeDragState({
        edge,
        startX: e.clientX,
        startRange: range,
      });
    },
    [range]
  );

  // Minimap calculations
  const minimapWindow = useMemo(() => {
    if (!bounds) return null;
    const boundsDuration = bounds.end - bounds.start;
    const left = ((range.start - bounds.start) / boundsDuration) * 100;
    const width = (duration / boundsDuration) * 100;
    return { left: `${left}%`, width: `${width}%` };
  }, [bounds, range, duration]);

  return (
    <div className="timeline-ruler-container">
      {/* Main timeline ruler */}
      <div
        ref={containerRef}
        className="timeline-ruler"
        data-testid="timeline-ruler"
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{
          position: 'relative',
          height: '32px',
          background: 'var(--bb-panel)',
          borderBottom: '1px solid var(--bb-border)',
          cursor: dragState ? 'grabbing' : 'grab',
          userSelect: 'none',
          overflow: 'hidden',
        }}
      >
        {/* Tick marks and labels */}
        {ticks.map((timestamp) => {
          const x = timestampToX(timestamp);
          return (
            <div
              key={timestamp}
              style={{
                position: 'absolute',
                left: x,
                top: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: '1px',
                  height: '8px',
                  background: 'var(--bb-gray)',
                  opacity: 0.5,
                }}
              />
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--bb-gray)',
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'nowrap',
                  transform: 'translateX(-50%)',
                  marginTop: '2px',
                }}
              >
                {formatTimestamp(timestamp, duration)}
              </span>
            </div>
          );
        })}

        {/* Cursor line */}
        {cursorX !== null && (
          <div
            data-testid="cursor-line"
            style={{
              position: 'absolute',
              left: cursorX,
              top: 0,
              height: '100%',
              width: '1px',
              background: 'var(--bb-cyan)',
              opacity: 0.7,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Edge drag handles - Premiere Pro style trim handles */}
        {onSetRange && (
          <>
            {/* Left edge handle */}
            <div
              data-testid="edge-handle-left"
              onMouseDown={handleEdgeMouseDown('left')}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '8px',
                height: '100%',
                cursor: 'ew-resize',
                background: edgeDragState?.edge === 'left'
                  ? 'var(--bb-cyan)'
                  : 'linear-gradient(90deg, var(--bb-amber) 0%, transparent 100%)',
                opacity: edgeDragState?.edge === 'left' ? 0.8 : 0.5,
                transition: 'opacity 0.15s ease',
                zIndex: 10,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = '0.8';
              }}
              onMouseLeave={(e) => {
                if (edgeDragState?.edge !== 'left') {
                  (e.currentTarget as HTMLElement).style.opacity = '0.5';
                }
              }}
            />
            {/* Right edge handle */}
            <div
              data-testid="edge-handle-right"
              onMouseDown={handleEdgeMouseDown('right')}
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                width: '8px',
                height: '100%',
                cursor: 'ew-resize',
                background: edgeDragState?.edge === 'right'
                  ? 'var(--bb-cyan)'
                  : 'linear-gradient(270deg, var(--bb-amber) 0%, transparent 100%)',
                opacity: edgeDragState?.edge === 'right' ? 0.8 : 0.5,
                transition: 'opacity 0.15s ease',
                zIndex: 10,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = '0.8';
              }}
              onMouseLeave={(e) => {
                if (edgeDragState?.edge !== 'right') {
                  (e.currentTarget as HTMLElement).style.opacity = '0.5';
                }
              }}
            />
          </>
        )}
      </div>

      {/* Minimap */}
      {bounds && (
        <div
          data-testid="timeline-minimap"
          style={{
            position: 'relative',
            height: '12px',
            background: 'var(--bb-bg)',
            borderBottom: '1px solid var(--bb-border)',
          }}
        >
          {/* Full range background */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--bb-panel)',
              opacity: 0.3,
            }}
          />
          {/* Visible window */}
          {minimapWindow && (
            <div
              data-testid="minimap-window"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: minimapWindow.left,
                width: minimapWindow.width,
                background: 'var(--bb-cyan)',
                opacity: 0.3,
                borderLeft: '1px solid var(--bb-cyan)',
                borderRight: '1px solid var(--bb-cyan)',
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
