import { describe, it, expect } from 'vitest';
import {
  zoomTimeline,
  panTimeline,
  clampTimeRange,
  getTimeRangePreset,
  timestampToPosition,
  positionToTimestamp,
  parseTimeInput,
  type TimeRange,
} from './timeline';

describe('timeline zoom utilities', () => {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  describe('zoomTimeline', () => {
    it('zooms in centered on cursor position', () => {
      const range: TimeRange = { start: 0, end: DAY };
      const cursorRatio = 0.5; // middle of timeline
      const zoomFactor = 0.5; // zoom in by 50%

      const result = zoomTimeline(range, cursorRatio, zoomFactor);

      // Should reduce range by 50%, centered on middle
      expect(result.end - result.start).toBe(DAY * 0.5);
      // Center should remain at same position
      const originalCenter = (range.start + range.end) / 2;
      const newCenter = (result.start + result.end) / 2;
      expect(newCenter).toBeCloseTo(originalCenter, 0);
    });

    it('zooms out centered on cursor position', () => {
      const range: TimeRange = { start: DAY * 0.25, end: DAY * 0.75 };
      const cursorRatio = 0.5;
      const zoomFactor = 2; // zoom out by 2x

      const result = zoomTimeline(range, cursorRatio, zoomFactor);

      expect(result.end - result.start).toBe(DAY);
    });

    it('zooms asymmetrically when cursor is not centered', () => {
      const range: TimeRange = { start: 0, end: DAY };
      const cursorRatio = 0.25; // 25% from left
      const zoomFactor = 0.5;

      const result = zoomTimeline(range, cursorRatio, zoomFactor);

      // Cursor position timestamp should be preserved
      const cursorTimestamp = range.start + (range.end - range.start) * cursorRatio;
      const newCursorRatio = (cursorTimestamp - result.start) / (result.end - result.start);
      expect(newCursorRatio).toBeCloseTo(cursorRatio, 2);
    });

    it('respects minimum zoom (1 hour)', () => {
      const range: TimeRange = { start: 0, end: HOUR };
      const result = zoomTimeline(range, 0.5, 0.5);

      expect(result.end - result.start).toBeGreaterThanOrEqual(HOUR);
    });

    it('respects maximum zoom (30 days)', () => {
      const range: TimeRange = { start: 0, end: 30 * DAY };
      const result = zoomTimeline(range, 0.5, 2);

      expect(result.end - result.start).toBeLessThanOrEqual(30 * DAY);
    });
  });

  describe('panTimeline', () => {
    it('pans right by positive delta', () => {
      const range: TimeRange = { start: DAY, end: 2 * DAY };
      const result = panTimeline(range, HOUR);

      expect(result.start).toBe(DAY + HOUR);
      expect(result.end).toBe(2 * DAY + HOUR);
    });

    it('pans left by negative delta', () => {
      const range: TimeRange = { start: DAY, end: 2 * DAY };
      const result = panTimeline(range, -HOUR);

      expect(result.start).toBe(DAY - HOUR);
      expect(result.end).toBe(2 * DAY - HOUR);
    });

    it('preserves range duration when panning', () => {
      const range: TimeRange = { start: 0, end: DAY };
      const result = panTimeline(range, 6 * HOUR);

      expect(result.end - result.start).toBe(DAY);
    });
  });

  describe('clampTimeRange', () => {
    it('clamps range to bounds', () => {
      const range: TimeRange = { start: -HOUR, end: 31 * DAY + HOUR };
      const bounds: TimeRange = { start: 0, end: 30 * DAY };

      const result = clampTimeRange(range, bounds);

      expect(result.start).toBeGreaterThanOrEqual(bounds.start);
      expect(result.end).toBeLessThanOrEqual(bounds.end);
    });

    it('shifts range when entirely outside bounds left', () => {
      const range: TimeRange = { start: -2 * DAY, end: -DAY };
      const bounds: TimeRange = { start: 0, end: 30 * DAY };

      const result = clampTimeRange(range, bounds);

      expect(result.start).toBe(bounds.start);
      expect(result.end - result.start).toBe(DAY);
    });

    it('shifts range when entirely outside bounds right', () => {
      const range: TimeRange = { start: 31 * DAY, end: 32 * DAY };
      const bounds: TimeRange = { start: 0, end: 30 * DAY };

      const result = clampTimeRange(range, bounds);

      expect(result.end).toBe(bounds.end);
      expect(result.end - result.start).toBe(DAY);
    });

    it('does not modify range within bounds', () => {
      const range: TimeRange = { start: DAY, end: 2 * DAY };
      const bounds: TimeRange = { start: 0, end: 30 * DAY };

      const result = clampTimeRange(range, bounds);

      expect(result).toEqual(range);
    });
  });

  describe('getTimeRangePreset', () => {
    const now = Date.now();

    it('returns 1 hour preset', () => {
      const result = getTimeRangePreset('1h', now);
      expect(result.end - result.start).toBe(HOUR);
      expect(result.end).toBe(now);
    });

    it('returns 6 hour preset', () => {
      const result = getTimeRangePreset('6h', now);
      expect(result.end - result.start).toBe(6 * HOUR);
      expect(result.end).toBe(now);
    });

    it('returns 24 hour preset', () => {
      const result = getTimeRangePreset('24h', now);
      expect(result.end - result.start).toBe(24 * HOUR);
      expect(result.end).toBe(now);
    });

    it('returns 7 day preset', () => {
      const result = getTimeRangePreset('7d', now);
      expect(result.end - result.start).toBe(7 * DAY);
      expect(result.end).toBe(now);
    });

    it('returns 30 day preset', () => {
      const result = getTimeRangePreset('30d', now);
      expect(result.end - result.start).toBe(30 * DAY);
      expect(result.end).toBe(now);
    });
  });

  describe('timestampToPosition', () => {
    it('converts timestamp to pixel position', () => {
      const range: TimeRange = { start: 0, end: DAY };
      const width = 1000;

      expect(timestampToPosition(0, range, width)).toBe(0);
      expect(timestampToPosition(DAY / 2, range, width)).toBe(500);
      expect(timestampToPosition(DAY, range, width)).toBe(1000);
    });

    it('handles timestamps outside range', () => {
      const range: TimeRange = { start: DAY, end: 2 * DAY };
      const width = 1000;

      expect(timestampToPosition(0, range, width)).toBe(-1000);
      expect(timestampToPosition(3 * DAY, range, width)).toBe(2000);
    });
  });

  describe('positionToTimestamp', () => {
    it('converts pixel position to timestamp', () => {
      const range: TimeRange = { start: 0, end: DAY };
      const width = 1000;

      expect(positionToTimestamp(0, range, width)).toBe(0);
      expect(positionToTimestamp(500, range, width)).toBe(DAY / 2);
      expect(positionToTimestamp(1000, range, width)).toBe(DAY);
    });

    it('handles positions outside width', () => {
      const range: TimeRange = { start: DAY, end: 2 * DAY };
      const width = 1000;

      expect(positionToTimestamp(-500, range, width)).toBe(DAY / 2);
      expect(positionToTimestamp(1500, range, width)).toBe(2.5 * DAY);
    });
  });

  describe('parseTimeInput', () => {
    const MIN = 60 * 1000;
    const now = Date.now();

    describe('duration formats', () => {
      it('parses minutes: "30m"', () => {
        const result = parseTimeInput('30m', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(30 * MIN);
        expect(result!.end).toBe(now);
      });

      it('parses minutes: "45min"', () => {
        const result = parseTimeInput('45min', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(45 * MIN);
      });

      it('parses hours: "2h"', () => {
        const result = parseTimeInput('2h', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(2 * HOUR);
      });

      it('parses hours: "3hr"', () => {
        const result = parseTimeInput('3hr', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(3 * HOUR);
      });

      it('parses hours: "4 hours"', () => {
        const result = parseTimeInput('4 hours', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(4 * HOUR);
      });

      it('parses days: "3d"', () => {
        const result = parseTimeInput('3d', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(3 * DAY);
      });

      it('parses days: "5 days"', () => {
        const result = parseTimeInput('5 days', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(5 * DAY);
      });

      it('parses weeks: "1w"', () => {
        const result = parseTimeInput('1w', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(7 * DAY);
      });

      it('parses weeks: "2 weeks"', () => {
        const result = parseTimeInput('2 weeks', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(14 * DAY);
      });
    });

    describe('relative formats', () => {
      it('parses "last 6h"', () => {
        const result = parseTimeInput('last 6h', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(6 * HOUR);
        expect(result!.end).toBe(now);
      });

      it('parses "past 2d"', () => {
        const result = parseTimeInput('past 2d', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(2 * DAY);
      });

      it('parses "last 30 minutes"', () => {
        const result = parseTimeInput('last 30 minutes', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(30 * MIN);
      });
    });

    describe('absolute range formats', () => {
      it('parses ISO date range with dash: "2024-12-25T10:00 - 2024-12-26T14:00"', () => {
        const result = parseTimeInput('2024-12-25T10:00 - 2024-12-26T14:00', now);
        expect(result).not.toBeNull();
        expect(result!.start).toBe(new Date('2024-12-25T10:00').getTime());
        expect(result!.end).toBe(new Date('2024-12-26T14:00').getTime());
      });

      it('parses ISO date range with "to": "2024-12-25 to 2024-12-26"', () => {
        const result = parseTimeInput('2024-12-25 to 2024-12-26', now);
        expect(result).not.toBeNull();
        expect(result!.start).toBe(new Date('2024-12-25').getTime());
        expect(result!.end).toBe(new Date('2024-12-26').getTime());
      });
    });

    describe('case insensitivity', () => {
      it('parses uppercase: "2H"', () => {
        const result = parseTimeInput('2H', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(2 * HOUR);
      });

      it('parses mixed case: "Last 6H"', () => {
        const result = parseTimeInput('Last 6H', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(6 * HOUR);
      });
    });

    describe('invalid inputs', () => {
      it('returns null for empty string', () => {
        expect(parseTimeInput('', now)).toBeNull();
      });

      it('returns null for invalid format', () => {
        expect(parseTimeInput('abc', now)).toBeNull();
      });

      it('returns null for invalid duration', () => {
        expect(parseTimeInput('0h', now)).toBeNull();
      });

      it('returns null for negative duration', () => {
        expect(parseTimeInput('-5h', now)).toBeNull();
      });
    });

    describe('whitespace handling', () => {
      it('trims leading/trailing whitespace', () => {
        const result = parseTimeInput('  2h  ', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(2 * HOUR);
      });

      it('handles multiple spaces between words', () => {
        const result = parseTimeInput('last   6   hours', now);
        expect(result).not.toBeNull();
        expect(result!.end - result!.start).toBe(6 * HOUR);
      });
    });
  });
});
