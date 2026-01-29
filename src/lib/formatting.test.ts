import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatUptime,
  formatBytesPerSecond,
  formatNumber,
  formatLatency,
  formatBlockHeight,
  formatWithThousands,
  formatPercent,
  formatRelativeTime,
  formatLotteryPower,
  formatCommission,
} from './formatting';

describe('formatUptime', () => {
  const MS_PER_SECOND = 1000;
  const MS_PER_MINUTE = 60 * MS_PER_SECOND;
  const MS_PER_HOUR = 60 * MS_PER_MINUTE;
  const MS_PER_DAY = 24 * MS_PER_HOUR;
  const MS_PER_MONTH = 30 * MS_PER_DAY;
  const MS_PER_YEAR = 365 * MS_PER_DAY;

  it('formats years and months for very long uptimes', () => {
    const oneYearElevenMonths = MS_PER_YEAR + 11 * MS_PER_MONTH;
    expect(formatUptime(oneYearElevenMonths)).toBe('1y 11mo');
  });

  it('formats months and days when under a year', () => {
    const threeMonthsFiveDays = 3 * MS_PER_MONTH + 5 * MS_PER_DAY;
    expect(formatUptime(threeMonthsFiveDays)).toBe('3mo 5d');
  });

  it('formats milliseconds into days and hours when days > 0 but months = 0', () => {
    const threeDays = 3 * MS_PER_DAY + 5 * MS_PER_HOUR;
    expect(formatUptime(threeDays)).toBe('3d 5h');
  });

  it('formats milliseconds into hours and minutes when hours > 0 but days = 0', () => {
    const fiveHours = 5 * MS_PER_HOUR + 30 * MS_PER_MINUTE;
    expect(formatUptime(fiveHours)).toBe('5h 30m');
  });

  it('formats milliseconds into just minutes when hours = 0', () => {
    const thirtyMinutes = 30 * MS_PER_MINUTE;
    expect(formatUptime(thirtyMinutes)).toBe('30m');
  });

  it('handles zero', () => {
    expect(formatUptime(0)).toBe('0m');
  });

  it('handles exactly one year', () => {
    expect(formatUptime(MS_PER_YEAR)).toBe('1y 0mo');
  });

  it('handles exactly one month', () => {
    expect(formatUptime(MS_PER_MONTH)).toBe('1mo 0d');
  });

  it('handles exactly one day', () => {
    expect(formatUptime(MS_PER_DAY)).toBe('1d 0h');
  });

  it('handles exactly one hour', () => {
    expect(formatUptime(MS_PER_HOUR)).toBe('1h 0m');
  });

  it('handles real API value (4+ days in ms)', () => {
    // Real API returns values like 368216253 ms
    expect(formatUptime(368216253)).toBe('4d 6h');
  });

  it('handles ~2 years uptime (like 16746 hours converted to ms)', () => {
    // 16746 hours = 60,285,600,000 ms ≈ 1y 11mo
    const longUptime = 16746 * MS_PER_HOUR;
    expect(formatUptime(longUptime)).toBe('1y 11mo');
  });
});

describe('formatBytesPerSecond', () => {
  it('returns "0 B/s" for null', () => {
    expect(formatBytesPerSecond(null)).toBe('0 B/s');
  });

  it('returns "0 B/s" for zero', () => {
    expect(formatBytesPerSecond(0)).toBe('0 B/s');
  });

  it('formats bytes for values < 1024', () => {
    expect(formatBytesPerSecond(512)).toBe('512 B/s');
  });

  it('formats kilobytes for values >= 1024 and < 1MB', () => {
    expect(formatBytesPerSecond(1024)).toBe('1.0 KB/s');
    expect(formatBytesPerSecond(1536)).toBe('1.5 KB/s');
    expect(formatBytesPerSecond(102400)).toBe('100.0 KB/s');
  });

  it('formats megabytes for values >= 1MB', () => {
    expect(formatBytesPerSecond(1024 * 1024)).toBe('1.0 MB/s');
    expect(formatBytesPerSecond(1.5 * 1024 * 1024)).toBe('1.5 MB/s');
    expect(formatBytesPerSecond(10 * 1024 * 1024)).toBe('10.0 MB/s');
  });
});

describe('formatNumber', () => {
  it('returns "N/A" for null', () => {
    expect(formatNumber(null)).toBe('N/A');
  });

  it('formats integer by default (0 decimals)', () => {
    expect(formatNumber(42)).toBe('42');
    expect(formatNumber(42.7)).toBe('43');
  });

  it('formats with specified decimals', () => {
    expect(formatNumber(42.567, 2)).toBe('42.57');
    expect(formatNumber(42.567, 1)).toBe('42.6');
  });

  it('appends suffix when provided', () => {
    expect(formatNumber(42, 0, '%')).toBe('42%');
    expect(formatNumber(42.5, 1, 'ms')).toBe('42.5ms');
  });
});

describe('formatLatency', () => {
  it('returns "-" for null', () => {
    expect(formatLatency(null)).toBe('-');
  });

  it('formats latency with ms suffix', () => {
    expect(formatLatency(42)).toBe('42ms');
    expect(formatLatency(150.7)).toBe('151ms');
  });

  it('handles zero latency', () => {
    expect(formatLatency(0)).toBe('0ms');
  });
});

describe('formatBlockHeight', () => {
  it('formats with locale separators', () => {
    expect(formatBlockHeight(1234567)).toBe('1,234,567');
  });

  it('handles small numbers', () => {
    expect(formatBlockHeight(42)).toBe('42');
  });

  it('handles zero', () => {
    expect(formatBlockHeight(0)).toBe('0');
  });
});

describe('formatWithThousands', () => {
  it('formats with thousand separators', () => {
    expect(formatWithThousands(1234567)).toBe('1,234,567');
  });

  it('handles small numbers without separators', () => {
    expect(formatWithThousands(42)).toBe('42');
    expect(formatWithThousands(999)).toBe('999');
  });

  it('handles numbers at thousand boundary', () => {
    expect(formatWithThousands(1000)).toBe('1,000');
  });

  it('handles zero', () => {
    expect(formatWithThousands(0)).toBe('0');
  });

  it('handles decimals (rounds)', () => {
    expect(formatWithThousands(1234.567)).toBe('1,234.567');
  });

  it('handles negative numbers', () => {
    expect(formatWithThousands(-1234567)).toBe('-1,234,567');
  });
});

describe('formatPercent', () => {
  it('formats decimal as percentage with default 2 decimals', () => {
    expect(formatPercent(0.5)).toBe('50.00%');
    expect(formatPercent(0.1234)).toBe('12.34%');
  });

  it('formats with custom decimal places', () => {
    expect(formatPercent(0.12345, 3)).toBe('12.345%');
    expect(formatPercent(0.5, 0)).toBe('50%');
  });

  it('handles zero', () => {
    expect(formatPercent(0)).toBe('0.00%');
  });

  it('handles values over 100%', () => {
    expect(formatPercent(1.5)).toBe('150.00%');
  });

  it('handles small values', () => {
    expect(formatPercent(0.001)).toBe('0.10%');
  });
});

describe('formatRelativeTime', () => {
  const NOW = 1706500000000; // Fixed timestamp for testing

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "--" for null timestamp', () => {
    expect(formatRelativeTime(null, true)).toBe('--');
    expect(formatRelativeTime(null, false)).toBe('--');
  });

  it('returns "..." when not mounted (hydration safety)', () => {
    expect(formatRelativeTime(NOW - 60000, false)).toBe('...');
  });

  it('returns "Just now" for recent timestamps (< 1 hour)', () => {
    expect(formatRelativeTime(NOW - 30 * 60 * 1000, true)).toBe('Just now');
    expect(formatRelativeTime(NOW - 59 * 60 * 1000, true)).toBe('Just now');
  });

  it('formats hours ago for timestamps < 24 hours', () => {
    expect(formatRelativeTime(NOW - 1 * 60 * 60 * 1000, true)).toBe('1h ago');
    expect(formatRelativeTime(NOW - 5 * 60 * 60 * 1000, true)).toBe('5h ago');
    expect(formatRelativeTime(NOW - 23 * 60 * 60 * 1000, true)).toBe('23h ago');
  });

  it('formats days ago for timestamps >= 24 hours', () => {
    expect(formatRelativeTime(NOW - 24 * 60 * 60 * 1000, true)).toBe('1d ago');
    expect(formatRelativeTime(NOW - 48 * 60 * 60 * 1000, true)).toBe('2d ago');
    expect(formatRelativeTime(NOW - 7 * 24 * 60 * 60 * 1000, true)).toBe('7d ago');
  });
});

describe('formatLotteryPower', () => {
  it('returns "--" for null', () => {
    expect(formatLotteryPower(null)).toBe('--');
  });

  it('formats lottery power with 3 decimal places', () => {
    expect(formatLotteryPower(0.05)).toBe('5.000%');
    expect(formatLotteryPower(0.12345)).toBe('12.345%');
  });

  it('handles very small values', () => {
    expect(formatLotteryPower(0.00001)).toBe('0.001%');
  });

  it('handles zero', () => {
    expect(formatLotteryPower(0)).toBe('0.000%');
  });
});

describe('formatCommission', () => {
  it('returns "--" for null', () => {
    expect(formatCommission(null)).toBe('--');
  });

  it('formats commission rate with 2 decimal places', () => {
    expect(formatCommission(0.1)).toBe('10.00%');
    expect(formatCommission(0.05)).toBe('5.00%');
  });

  it('handles zero commission', () => {
    expect(formatCommission(0)).toBe('0.00%');
  });

  it('handles small values', () => {
    expect(formatCommission(0.001)).toBe('0.10%');
  });
});
