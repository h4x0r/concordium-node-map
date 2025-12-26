/**
 * Timeline zoom and pan utilities for the deep dive panel
 */

export interface TimeRange {
  start: number; // timestamp in ms
  end: number;   // timestamp in ms
}

export type TimeRangePreset = '1h' | '6h' | '24h' | '7d' | '30d';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MIN_RANGE = HOUR;      // 1 hour minimum zoom
const MAX_RANGE = 30 * DAY;  // 30 days maximum zoom

/**
 * Zoom the timeline in or out, centered on cursor position
 * @param range Current time range
 * @param cursorRatio Position of cursor as ratio (0-1) from left
 * @param zoomFactor Factor to multiply range by (< 1 zooms in, > 1 zooms out)
 * @returns New time range
 */
export function zoomTimeline(
  range: TimeRange,
  cursorRatio: number,
  zoomFactor: number
): TimeRange {
  const currentDuration = range.end - range.start;
  let newDuration = currentDuration * zoomFactor;

  // Clamp to min/max zoom levels
  newDuration = Math.max(MIN_RANGE, Math.min(MAX_RANGE, newDuration));

  // Calculate cursor timestamp
  const cursorTimestamp = range.start + currentDuration * cursorRatio;

  // Calculate new start/end keeping cursor at same ratio
  const newStart = cursorTimestamp - newDuration * cursorRatio;
  const newEnd = cursorTimestamp + newDuration * (1 - cursorRatio);

  return { start: newStart, end: newEnd };
}

/**
 * Pan the timeline by a time delta
 * @param range Current time range
 * @param delta Time delta in ms (positive = pan right/forward)
 * @returns New time range
 */
export function panTimeline(range: TimeRange, delta: number): TimeRange {
  return {
    start: range.start + delta,
    end: range.end + delta,
  };
}

/**
 * Clamp a time range to valid bounds, preserving duration if possible
 * @param range Range to clamp
 * @param bounds Valid bounds
 * @returns Clamped range
 */
export function clampTimeRange(range: TimeRange, bounds: TimeRange): TimeRange {
  const duration = range.end - range.start;

  // If range is entirely within bounds, return as-is
  if (range.start >= bounds.start && range.end <= bounds.end) {
    return range;
  }

  // If range exceeds bounds on left, shift right
  if (range.start < bounds.start) {
    return {
      start: bounds.start,
      end: Math.min(bounds.end, bounds.start + duration),
    };
  }

  // If range exceeds bounds on right, shift left
  if (range.end > bounds.end) {
    return {
      start: Math.max(bounds.start, bounds.end - duration),
      end: bounds.end,
    };
  }

  return range;
}

/**
 * Get a preset time range ending at the given timestamp
 * @param preset Preset identifier
 * @param endTimestamp End timestamp (typically now)
 * @returns Time range for preset
 */
export function getTimeRangePreset(
  preset: TimeRangePreset,
  endTimestamp: number
): TimeRange {
  const durations: Record<TimeRangePreset, number> = {
    '1h': HOUR,
    '6h': 6 * HOUR,
    '24h': 24 * HOUR,
    '7d': 7 * DAY,
    '30d': 30 * DAY,
  };

  const duration = durations[preset];
  return {
    start: endTimestamp - duration,
    end: endTimestamp,
  };
}

/**
 * Convert timestamp to pixel position within container
 * @param timestamp Timestamp in ms
 * @param range Visible time range
 * @param width Container width in pixels
 * @returns X position in pixels
 */
export function timestampToPosition(
  timestamp: number,
  range: TimeRange,
  width: number
): number {
  const duration = range.end - range.start;
  const ratio = (timestamp - range.start) / duration;
  return ratio * width;
}

/**
 * Convert pixel position to timestamp
 * @param position X position in pixels
 * @param range Visible time range
 * @param width Container width in pixels
 * @returns Timestamp in ms
 */
export function positionToTimestamp(
  position: number,
  range: TimeRange,
  width: number
): number {
  const ratio = position / width;
  const duration = range.end - range.start;
  return range.start + ratio * duration;
}

const MINUTE = 60 * 1000;

/**
 * Parse a free-form time input string into a TimeRange
 * Supports formats:
 * - Duration: "30m", "2h", "3d", "1w", "45min", "2 hours", "5 days"
 * - Relative: "last 6h", "past 2d", "last 30 minutes"
 * - Absolute: "2024-12-25T10:00 - 2024-12-26T14:00", "2024-12-25 to 2024-12-26"
 *
 * @param input User input string
 * @param now Current timestamp (for relative calculations)
 * @returns TimeRange or null if invalid
 */
export function parseTimeInput(input: string, now: number): TimeRange | null {
  // Normalize input: trim, lowercase, collapse multiple spaces
  const normalized = input.trim().toLowerCase().replace(/\s+/g, ' ');

  if (!normalized) {
    return null;
  }

  // Try absolute range first (contains " - " or " to ")
  const absoluteResult = parseAbsoluteRange(normalized);
  if (absoluteResult) {
    return absoluteResult;
  }

  // Try relative format ("last X", "past X")
  const relativeResult = parseRelativeFormat(normalized, now);
  if (relativeResult) {
    return relativeResult;
  }

  // Try simple duration format ("2h", "30m", "3d", etc.)
  const durationResult = parseDurationFormat(normalized, now);
  if (durationResult) {
    return durationResult;
  }

  return null;
}

/**
 * Parse duration string into milliseconds
 * Supports: 30m, 2h, 3d, 1w, 45min, 2 hours, 5 days, 2 weeks
 */
function parseDuration(input: string): number | null {
  // Pattern: number + optional space + unit
  const match = input.match(/^(\d+)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|weeks?)$/i);

  if (!match) {
    return null;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (value <= 0) {
    return null;
  }

  // Convert to milliseconds
  if (unit.startsWith('m') && !unit.startsWith('mi')) {
    // "m" alone means minutes
    return value * MINUTE;
  }
  if (unit.startsWith('mi')) {
    // "min", "mins", "minute", "minutes"
    return value * MINUTE;
  }
  if (unit.startsWith('h')) {
    // "h", "hr", "hrs", "hour", "hours"
    return value * HOUR;
  }
  if (unit.startsWith('d')) {
    // "d", "day", "days"
    return value * DAY;
  }
  if (unit.startsWith('w')) {
    // "w", "week", "weeks"
    return value * 7 * DAY;
  }

  return null;
}

/**
 * Parse simple duration format like "2h", "30m"
 */
function parseDurationFormat(input: string, now: number): TimeRange | null {
  const duration = parseDuration(input);

  if (duration === null) {
    return null;
  }

  return {
    start: now - duration,
    end: now,
  };
}

/**
 * Parse relative format like "last 6h", "past 2d"
 */
function parseRelativeFormat(input: string, now: number): TimeRange | null {
  // Pattern: "last" or "past" + duration
  const match = input.match(/^(last|past)\s+(.+)$/i);

  if (!match) {
    return null;
  }

  const durationStr = match[2];
  const duration = parseDuration(durationStr);

  if (duration === null) {
    return null;
  }

  return {
    start: now - duration,
    end: now,
  };
}

/**
 * Parse absolute date range like "2024-12-25T10:00 - 2024-12-26T14:00"
 */
function parseAbsoluteRange(input: string): TimeRange | null {
  // Try " - " separator
  let parts = input.split(/\s+-\s+/);
  if (parts.length !== 2) {
    // Try " to " separator
    parts = input.split(/\s+to\s+/);
  }

  if (parts.length !== 2) {
    return null;
  }

  const start = new Date(parts[0]).getTime();
  const end = new Date(parts[1]).getTime();

  if (isNaN(start) || isNaN(end)) {
    return null;
  }

  if (start >= end) {
    return null;
  }

  return { start, end };
}
