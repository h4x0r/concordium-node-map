'use client';

import { useQuery } from '@tanstack/react-query';

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

interface WebamonResponse {
  ip: string;
  scans: WebamonScan[];
  total: number;
  http_available: boolean;
  scannable_urls?: string[];
  cached_at?: number;
  message?: string;
}

/**
 * Fetch Webamon scan data for an IP
 */
async function fetchWebamon(ip: string, ports: number[]): Promise<WebamonResponse> {
  const portsParam = ports.length > 0 ? `&ports=${ports.join(',')}` : '';
  const response = await fetch(`/api/webamon?ip=${ip}${portsParam}`);

  if (!response.ok) {
    throw new Error(`Webamon API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Hook to fetch Webamon data for an IP
 * @param ip - IP address to lookup
 * @param ports - Known open ports (to determine if HTTP scanning is possible)
 */
export function useWebamon(ip: string | null, ports: number[] = []) {
  return useQuery({
    queryKey: ['webamon', ip, ports.join(',')],
    queryFn: () => fetchWebamon(ip!, ports),
    enabled: !!ip,
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60, // 1 hour cache
    retry: 1,
  });
}

/**
 * Request a new Webamon scan for a URL
 */
export async function requestWebamonScan(url: string): Promise<{ scan_id: string } | null> {
  try {
    const response = await fetch('/api/webamon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(`Scan request failed: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('[useWebamon] Scan request error:', error);
    return null;
  }
}
