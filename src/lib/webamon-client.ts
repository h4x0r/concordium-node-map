/**
 * Webamon API Client
 * For web screenshot and scan data enrichment
 */

const WEBAMON_API_URL = 'https://api.webamon.com';

interface WebamonScan {
  id: string;
  url: string;
  screenshot_url?: string;
  final_url?: string;
  status_code?: number;
  title?: string;
  technologies?: string[];
  headers?: Record<string, string>;
  created_at: string;
  ip?: string;
  asn?: string;
  country?: string;
}

interface WebamonSearchResult {
  total: number;
  scans: WebamonScan[];
}

export interface WebamonData {
  scans: WebamonScan[];
  total: number;
  cached_at?: number;
}

/**
 * Search Webamon for scans of a specific IP
 */
export async function searchByIP(ip: string): Promise<WebamonData | null> {
  const apiKey = process.env.WEBAMON_API_KEY;
  if (!apiKey) {
    console.warn('[Webamon] No API key configured');
    return null;
  }

  try {
    const response = await fetch(`${WEBAMON_API_URL}/v1/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query: {
          ip: ip,
        },
        limit: 10,
        sort: { field: 'created_at', order: 'desc' },
      }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { scans: [], total: 0 };
      }
      throw new Error(`Webamon API error: ${response.status}`);
    }

    const data: WebamonSearchResult = await response.json();
    return {
      scans: data.scans || [],
      total: data.total || 0,
      cached_at: Date.now(),
    };
  } catch (error) {
    console.error('[Webamon] Search error:', error);
    return null;
  }
}

/**
 * Request a new scan for a URL
 */
export async function requestScan(url: string): Promise<string | null> {
  const apiKey = process.env.WEBAMON_API_KEY;
  if (!apiKey) {
    console.warn('[Webamon] No API key configured');
    return null;
  }

  try {
    const response = await fetch(`${WEBAMON_API_URL}/v1/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        url: url,
        screenshot: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Webamon scan request error: ${response.status}`);
    }

    const data = await response.json();
    return data.scan_id || null;
  } catch (error) {
    console.error('[Webamon] Scan request error:', error);
    return null;
  }
}

/**
 * Get scan result by ID
 */
export async function getScan(scanId: string): Promise<WebamonScan | null> {
  const apiKey = process.env.WEBAMON_API_KEY;
  if (!apiKey) {
    console.warn('[Webamon] No API key configured');
    return null;
  }

  try {
    const response = await fetch(`${WEBAMON_API_URL}/v1/scan/${scanId}`, {
      headers: {
        'x-api-key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Webamon get scan error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Webamon] Get scan error:', error);
    return null;
  }
}

/**
 * Check if IP has HTTP ports that Webamon can scan
 */
export function hasHttpPorts(ports: number[]): boolean {
  const httpPorts = [80, 443, 8080, 8443, 3000, 5000, 8000, 8888, 9000];
  return ports.some((port) => httpPorts.includes(port));
}

/**
 * Build scannable URLs from IP and HTTP ports
 */
export function buildScannableUrls(ip: string, ports: number[]): string[] {
  const httpPorts = [80, 8080, 3000, 5000, 8000, 8888, 9000];
  const httpsPorts = [443, 8443];

  const urls: string[] = [];

  for (const port of ports) {
    if (httpsPorts.includes(port)) {
      urls.push(port === 443 ? `https://${ip}` : `https://${ip}:${port}`);
    } else if (httpPorts.includes(port)) {
      urls.push(port === 80 ? `http://${ip}` : `http://${ip}:${port}`);
    }
  }

  return urls;
}
