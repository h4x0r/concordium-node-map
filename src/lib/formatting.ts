/**
 * Centralized formatting utilities
 * Consolidates duplicate formatting functions from mobile and desktop components
 */

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_MONTH = 30 * MS_PER_DAY; // Approximate
const MS_PER_YEAR = 365 * MS_PER_DAY; // Approximate

/**
 * Format uptime from milliseconds to human-readable string
 * @param ms - uptime in milliseconds (as returned by Concordium API)
 * @returns formatted string like "1y 11mo", "45d 5h", "5h 30m", or "30m"
 */
export function formatUptime(ms: number): string {
  const years = Math.floor(ms / MS_PER_YEAR);
  const months = Math.floor((ms % MS_PER_YEAR) / MS_PER_MONTH);
  const days = Math.floor((ms % MS_PER_MONTH) / MS_PER_DAY);
  const hours = Math.floor((ms % MS_PER_DAY) / MS_PER_HOUR);
  const mins = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);

  if (years > 0) return `${years}y ${months}mo`;
  if (months > 0) return `${months}mo ${days}d`;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * Format bytes per second to human-readable string
 * @param bytes - bytes per second (or null)
 * @returns formatted string like "1.5 KB/s", "10.0 MB/s", or "0 B/s"
 */
export function formatBytesPerSecond(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '0 B/s';
  if (bytes < 1024) return `${Math.round(bytes)} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
}

/**
 * Format a number with optional decimals and suffix
 * @param value - number to format (or null)
 * @param decimals - decimal places (default 0)
 * @param suffix - optional suffix to append
 * @returns formatted string or "N/A" for null
 */
export function formatNumber(
  value: number | null,
  decimals: number = 0,
  suffix: string = ''
): string {
  if (value === null) return 'N/A';
  return `${value.toFixed(decimals)}${suffix}`;
}

/**
 * Format latency in milliseconds
 * @param ms - latency in milliseconds (or null)
 * @returns formatted string like "42ms" or "-" for null
 */
export function formatLatency(ms: number | null): string {
  if (ms === null) return '-';
  return `${Math.round(ms)}ms`;
}

/**
 * Format block height with locale separators
 * @param height - block height
 * @returns formatted string like "1,234,567"
 */
export function formatBlockHeight(height: number): string {
  return height.toLocaleString('en-US');
}
