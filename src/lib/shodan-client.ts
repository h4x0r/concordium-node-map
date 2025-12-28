/**
 * InternetDB client for free IP OSINT lookups
 * https://internetdb.shodan.io - Free, no API key needed
 */

export interface InternetDBResult {
  ip: string;
  ports: number[];
  hostnames: string[];
  tags: string[];
  vulns: string[];
  cpes: string[];
}

/**
 * InternetDB client (free, no API key needed)
 */
export class InternetDBClient {
  private baseUrl = 'https://internetdb.shodan.io';

  /**
   * Look up an IP address
   * Free, no rate limit published
   */
  async lookup(ip: string): Promise<InternetDBResult | null> {
    try {
      const response = await fetch(`${this.baseUrl}/${ip}`);

      if (response.status === 404) {
        // No data for this IP
        return null;
      }

      if (!response.ok) {
        throw new Error(`InternetDB lookup failed: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error(`InternetDB lookup failed for ${ip}:`, error);
      return null;
    }
  }

  /**
   * Batch lookup multiple IPs
   * Sequential with small delay to be nice
   */
  async batchLookup(ips: string[]): Promise<Map<string, InternetDBResult | null>> {
    const results = new Map<string, InternetDBResult | null>();

    for (const ip of ips) {
      results.set(ip, await this.lookup(ip));
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }
}

// Singleton instance
let internetDBClient: InternetDBClient | null = null;

export function getInternetDBClient(): InternetDBClient {
  if (!internetDBClient) {
    internetDBClient = new InternetDBClient();
  }
  return internetDBClient;
}
