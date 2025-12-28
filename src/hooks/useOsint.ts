import { useQuery } from '@tanstack/react-query';

export interface OsintQuickData {
  ip: string;
  reputation: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  ports: number[];
  vulns_count: number;
  last_scan: string | null;
}

export interface OsintFullData {
  ip: string;
  reputation: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  ports: number[];
  hostnames: string[];
  tags: string[];
  vulns: string[];
  cpes: string[];
  cached_at: string | null;
}

async function fetchOsintQuick(ip: string): Promise<OsintQuickData> {
  const res = await fetch(`/api/osint?ip=${encodeURIComponent(ip)}&mode=quick`);
  if (!res.ok) {
    throw new Error('Failed to fetch OSINT data');
  }
  return res.json();
}

async function fetchOsintFull(ip: string): Promise<OsintFullData> {
  const res = await fetch(`/api/osint?ip=${encodeURIComponent(ip)}&mode=full`);
  if (!res.ok) {
    throw new Error('Failed to fetch OSINT data');
  }
  return res.json();
}

/**
 * Hook for quick OSINT data (hover card)
 * Uses InternetDB (free, cached 24h)
 */
export function useOsintQuick(ip: string | null) {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['osint-quick', ip],
    queryFn: () => fetchOsintQuick(ip!),
    enabled: !!ip,
    staleTime: 5 * 60 * 1000, // 5 minutes client-side cache
    refetchOnWindowFocus: false,
  });

  return {
    data,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for full OSINT data (drawer)
 * Uses InternetDB (free, cached 24h)
 */
export function useOsintFull(ip: string | null) {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['osint-full', ip],
    queryFn: () => fetchOsintFull(ip!),
    enabled: !!ip,
    staleTime: 5 * 60 * 1000, // 5 minutes client-side cache
    refetchOnWindowFocus: false,
  });

  return {
    data,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Get reputation color for styling
 */
export function getReputationColor(reputation: OsintQuickData['reputation']): string {
  switch (reputation) {
    case 'clean':
      return 'var(--bb-green)';
    case 'suspicious':
      return 'var(--bb-amber)';
    case 'malicious':
      return 'var(--bb-red)';
    default:
      return 'var(--bb-gray)';
  }
}

/**
 * Get reputation label for display
 */
export function getReputationLabel(reputation: OsintQuickData['reputation']): string {
  switch (reputation) {
    case 'clean':
      return 'CLEAN';
    case 'suspicious':
      return 'SUSPICIOUS';
    case 'malicious':
      return 'MALICIOUS';
    default:
      return 'UNKNOWN';
  }
}
