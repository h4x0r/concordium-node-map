/**
 * IP Geolocation service using ip-api.com
 * Free tier: 45 requests/minute, no API key needed
 */

export interface GeoResult {
  status: 'success' | 'fail';
  country?: string;
  city?: string;
  lat?: number;
  lon?: number;
  isp?: string;
  message?: string;
}

const IP_API_BASE = 'http://ip-api.com/json';
const IP_API_FIELDS = 'status,country,city,lat,lon,isp';

// Rate limit: 45 requests per minute
const RATE_LIMIT = 45;
const RATE_WINDOW_MS = 60 * 1000;

export class GeoLookupService {
  private cache: Map<string, GeoResult> = new Map();
  private requestTimestamps: number[] = [];

  /**
   * Check if an IP is in a private range
   */
  isPrivateIP(ip: string): boolean {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return false;

    const [a, b] = parts;

    // 10.0.0.0 - 10.255.255.255
    if (a === 10) return true;

    // 172.16.0.0 - 172.31.255.255
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0 - 192.168.255.255
    if (a === 192 && b === 168) return true;

    // 127.0.0.0 - 127.255.255.255 (localhost)
    if (a === 127) return true;

    return false;
  }

  /**
   * Check if we're within rate limit
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    // Remove timestamps older than the rate window
    this.requestTimestamps = this.requestTimestamps.filter(
      (ts) => now - ts < RATE_WINDOW_MS
    );
    return this.requestTimestamps.length < RATE_LIMIT;
  }

  /**
   * Record a request for rate limiting
   */
  private recordRequest(): void {
    this.requestTimestamps.push(Date.now());
  }

  /**
   * Look up geo data for a single IP address
   * Returns null if lookup fails or IP is private
   */
  async lookupIP(ip: string): Promise<GeoResult | null> {
    // Check cache first
    if (this.cache.has(ip)) {
      return this.cache.get(ip)!;
    }

    // Skip private IPs
    if (this.isPrivateIP(ip)) {
      return null;
    }

    // Check rate limit
    if (!this.checkRateLimit()) {
      // Could implement queuing here, but for now just return null
      return null;
    }

    try {
      this.recordRequest();

      const response = await fetch(
        `${IP_API_BASE}/${ip}?fields=${IP_API_FIELDS}`
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      if (data.status === 'fail') {
        return null;
      }

      const result: GeoResult = {
        status: data.status,
        country: data.country,
        city: data.city,
        lat: data.lat,
        lon: data.lon,
        isp: data.isp,
      };

      // Cache successful results
      this.cache.set(ip, result);

      return result;
    } catch {
      return null;
    }
  }

  /**
   * Look up geo data for multiple IPs
   * Skips private IPs and respects rate limits
   */
  async lookupBatch(ips: string[]): Promise<Map<string, GeoResult>> {
    const results = new Map<string, GeoResult>();

    // Filter out private IPs and already cached
    const toFetch = ips.filter((ip) => {
      if (this.isPrivateIP(ip)) return false;
      if (this.cache.has(ip)) {
        results.set(ip, this.cache.get(ip)!);
        return false;
      }
      return true;
    });

    // Fetch remaining IPs
    for (const ip of toFetch) {
      const result = await this.lookupIP(ip);
      if (result) {
        results.set(ip, result);
      }
    }

    return results;
  }

  /**
   * Clear the cache (useful for testing or when geo data might be stale)
   */
  clearCache(): void {
    this.cache.clear();
  }
}
