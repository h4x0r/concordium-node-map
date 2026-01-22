/**
 * Hydration-safe formatting utilities
 *
 * These functions use explicit locales to ensure consistent output
 * between server-side rendering and client-side hydration.
 */

/**
 * Format a number with thousand separators (hydration-safe).
 * Uses en-US locale explicitly to avoid server/client mismatch.
 */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/**
 * Format a percentage with specified decimal places.
 */
export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format relative time from a timestamp.
 * Returns a placeholder if not yet mounted to avoid hydration mismatch.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @param isMounted - Whether component is mounted (client-side)
 * @returns Formatted relative time string
 */
export function formatRelativeTime(
  timestamp: number | null,
  isMounted: boolean
): string {
  if (timestamp === null) return '--';
  if (!isMounted) return '...';

  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Format lottery power as a percentage.
 */
export function formatLotteryPower(power: number | null): string {
  if (power === null) return '--';
  return `${(power * 100).toFixed(3)}%`;
}

/**
 * Format commission rate as a percentage.
 */
export function formatCommission(rate: number | null): string {
  if (rate === null) return '--';
  return `${(rate * 100).toFixed(2)}%`;
}
