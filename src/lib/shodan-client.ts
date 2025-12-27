/**
 * Shodan API client for OSINT data
 * Supports both the paid API (search) and free InternetDB
 */

export interface ShodanSearchResult {
  ip_str: string;
  port: number;
  org?: string;
  isp?: string;
  asn?: string;
  country_code?: string;
  city?: string;
  hostnames?: string[];
  vulns?: string[];
  product?: string;
  os?: string;
  timestamp?: string;
}

export interface ShodanSearchResponse {
  matches: ShodanSearchResult[];
  total: number;
}

export interface InternetDBResult {
  ip: string;
  ports: number[];
  hostnames: string[];
  tags: string[];
  vulns: string[];
  cpes: string[];
}

export interface ShodanHostResult {
  ip_str: string;
  ports: number[];
  hostnames: string[];
  org?: string;
  isp?: string;
  asn?: string;
  country_code?: string;
  city?: string;
  vulns?: string[];
  os?: string;
  data?: Array<{
    port: number;
    product?: string;
    version?: string;
    transport?: string;
  }>;
}

/**
 * Shodan API client
 */
export class ShodanClient {
  private apiKey: string;
  private baseUrl = 'https://api.shodan.io';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SHODAN_API_KEY || '';
  }

  /**
   * Search Shodan for hosts matching a query
   * Uses 1 query credit per page
   */
  async search(query: string, page = 1): Promise<ShodanSearchResponse> {
    if (!this.apiKey) {
      throw new Error('Shodan API key required for search');
    }

    const url = new URL(`${this.baseUrl}/shodan/host/search`);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('query', query);
    url.searchParams.set('page', page.toString());

    const response = await fetch(url.toString());

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shodan search failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Search and download all results for a query
   * Iterates through pages until exhausted
   */
  async searchAll(query: string, maxPages = 20): Promise<ShodanSearchResult[]> {
    const results: ShodanSearchResult[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= maxPages) {
      try {
        const response = await this.search(query, page);
        results.push(...response.matches);

        // Check if we've fetched all results
        if (results.length >= response.total || response.matches.length === 0) {
          hasMore = false;
        } else {
          page++;
          // Rate limit: don't hammer the API
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Shodan search page ${page} failed:`, error);
        hasMore = false;
      }
    }

    return results;
  }

  /**
   * Get detailed host information
   * Uses 1 query credit
   */
  async host(ip: string): Promise<ShodanHostResult> {
    if (!this.apiKey) {
      throw new Error('Shodan API key required for host lookup');
    }

    const url = new URL(`${this.baseUrl}/shodan/host/${ip}`);
    url.searchParams.set('key', this.apiKey);

    const response = await fetch(url.toString());

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shodan host lookup failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Get account info including remaining credits
   */
  async accountInfo(): Promise<{
    credits: number;
    query_credits: number;
    scan_credits: number;
  }> {
    if (!this.apiKey) {
      throw new Error('Shodan API key required');
    }

    const url = new URL(`${this.baseUrl}/api-info`);
    url.searchParams.set('key', this.apiKey);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Shodan API info failed: ${response.status}`);
    }

    return response.json();
  }
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

// Singleton instances
let shodanClient: ShodanClient | null = null;
let internetDBClient: InternetDBClient | null = null;

export function getShodanClient(): ShodanClient {
  if (!shodanClient) {
    shodanClient = new ShodanClient();
  }
  return shodanClient;
}

export function getInternetDBClient(): InternetDBClient {
  if (!internetDBClient) {
    internetDBClient = new InternetDBClient();
  }
  return internetDBClient;
}
