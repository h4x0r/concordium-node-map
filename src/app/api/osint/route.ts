import { NextResponse } from 'next/server';
import { getDbClient, initializeSchema } from '@/lib/db/client';
import { getInternetDBClient, type InternetDBResult } from '@/lib/shodan-client';
import type { ShodanScanRecord, OsintCacheRecord } from '@/lib/db/schema';

// Cache TTLs
const INTERNETDB_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface OsintQuickResponse {
  ip: string;
  reputation: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  ports: number[];
  vulns_count: number;
  last_scan: string | null;
  has_full_report: boolean;
}

export interface OsintFullResponse {
  ip: string;
  reputation: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  // InternetDB data
  ports: number[];
  hostnames: string[];
  tags: string[];
  vulns: string[];
  cpes: string[];
  // Shodan data (if available)
  org: string | null;
  isp: string | null;
  asn: string | null;
  country_code: string | null;
  city: string | null;
  product: string | null;
  os: string | null;
  last_updated: string | null;
  cached_at: string | null;
}

/**
 * Calculate reputation based on vulns and tags
 */
function calculateReputation(vulns: string[], tags: string[]): 'clean' | 'suspicious' | 'malicious' | 'unknown' {
  if (vulns.length === 0 && tags.length === 0) {
    return 'unknown';
  }

  // Check for malicious indicators
  const maliciousTags = ['malware', 'c2', 'botnet', 'compromised', 'tor'];
  if (tags.some(t => maliciousTags.includes(t.toLowerCase()))) {
    return 'malicious';
  }

  // High severity vulns
  if (vulns.length > 5) {
    return 'malicious';
  }

  if (vulns.length > 0) {
    return 'suspicious';
  }

  // Suspicious tags
  const suspiciousTags = ['self-signed', 'expired', 'honeypot'];
  if (tags.some(t => suspiciousTags.includes(t.toLowerCase()))) {
    return 'suspicious';
  }

  return 'clean';
}

/**
 * Get OSINT data for an IP address
 *
 * GET /api/osint?ip=1.2.3.4&mode=quick|full
 *
 * quick: Returns minimal data for hover card (InternetDB, cached 24h)
 * full: Returns comprehensive data including Shodan cache
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ip = searchParams.get('ip');
  const mode = searchParams.get('mode') || 'quick';

  if (!ip) {
    return NextResponse.json({ error: 'IP address required' }, { status: 400 });
  }

  // Validate IP format
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) {
    return NextResponse.json({ error: 'Invalid IP address format' }, { status: 400 });
  }

  try {
    const db = getDbClient();
    await initializeSchema();

    const now = Date.now();

    // Check InternetDB cache first
    let internetDBData: InternetDBResult | null = null;
    const cachedResult = await db.execute({
      sql: 'SELECT * FROM osint_cache WHERE ip = ? AND source = ? AND expires_at > ?',
      args: [ip, 'internetdb', now],
    });

    if (cachedResult.rows.length > 0) {
      const cached = cachedResult.rows[0] as unknown as OsintCacheRecord;
      internetDBData = {
        ip: cached.ip,
        ports: cached.ports ? JSON.parse(cached.ports) : [],
        hostnames: cached.hostnames ? JSON.parse(cached.hostnames) : [],
        tags: cached.tags ? JSON.parse(cached.tags) : [],
        vulns: cached.vulns ? JSON.parse(cached.vulns) : [],
        cpes: cached.cpes ? JSON.parse(cached.cpes) : [],
      };
    } else {
      // Fetch from InternetDB
      const internetDB = getInternetDBClient();
      internetDBData = await internetDB.lookup(ip);

      if (internetDBData) {
        // Cache the result
        await db.execute({
          sql: `
            INSERT INTO osint_cache (ip, source, ports, hostnames, tags, vulns, cpes, fetched_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ip) DO UPDATE SET
              source = excluded.source,
              ports = excluded.ports,
              hostnames = excluded.hostnames,
              tags = excluded.tags,
              vulns = excluded.vulns,
              cpes = excluded.cpes,
              fetched_at = excluded.fetched_at,
              expires_at = excluded.expires_at
          `,
          args: [
            ip,
            'internetdb',
            JSON.stringify(internetDBData.ports),
            JSON.stringify(internetDBData.hostnames),
            JSON.stringify(internetDBData.tags),
            JSON.stringify(internetDBData.vulns),
            JSON.stringify(internetDBData.cpes),
            now,
            now + INTERNETDB_TTL_MS,
          ],
        });
      }
    }

    // Check Shodan cache
    const shodanResult = await db.execute({
      sql: 'SELECT * FROM shodan_scans WHERE ip = ?',
      args: [ip],
    });
    const shodanData = shodanResult.rows[0] as unknown as ShodanScanRecord | undefined;

    // Build response based on mode
    const ports = internetDBData?.ports || [];
    const vulns = internetDBData?.vulns || [];
    const tags = internetDBData?.tags || [];
    const reputation = calculateReputation(vulns, tags);

    if (mode === 'quick') {
      const response: OsintQuickResponse = {
        ip,
        reputation,
        ports,
        vulns_count: vulns.length,
        last_scan: shodanData?.cached_at
          ? new Date(shodanData.cached_at).toISOString()
          : (internetDBData ? 'InternetDB' : null),
        has_full_report: !!shodanData,
      };
      return NextResponse.json(response);
    }

    // Full mode
    const response: OsintFullResponse = {
      ip,
      reputation,
      // InternetDB data
      ports,
      hostnames: internetDBData?.hostnames || [],
      tags,
      vulns,
      cpes: internetDBData?.cpes || [],
      // Shodan data
      org: shodanData?.org || null,
      isp: shodanData?.isp || null,
      asn: shodanData?.asn || null,
      country_code: shodanData?.country_code || null,
      city: shodanData?.city || null,
      product: shodanData?.product || null,
      os: shodanData?.os || null,
      last_updated: shodanData?.last_updated
        ? new Date(shodanData.last_updated).toISOString()
        : null,
      cached_at: shodanData?.cached_at
        ? new Date(shodanData.cached_at).toISOString()
        : null,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('OSINT lookup failed:', error);
    return NextResponse.json({
      error: 'OSINT lookup failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
