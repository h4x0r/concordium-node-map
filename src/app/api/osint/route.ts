import { NextResponse } from 'next/server';
import { getDbClient, initializeSchema } from '@/lib/db/client';
import { getInternetDBClient, type InternetDBResult } from '@/lib/shodan-client';
import type { OsintCacheRecord } from '@/lib/db/schema';

// Cache TTL: 24 hours
const INTERNETDB_TTL_MS = 24 * 60 * 60 * 1000;

export interface OsintQuickResponse {
  ip: string;
  reputation: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  ports: number[];
  vulns_count: number;
  last_scan: string | null;
}

export interface OsintFullResponse {
  ip: string;
  reputation: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  ports: number[];
  hostnames: string[];
  tags: string[];
  vulns: string[];
  cpes: string[];
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
 * Get OSINT data for an IP address using InternetDB (free)
 *
 * GET /api/osint?ip=1.2.3.4&mode=quick|full
 *
 * quick: Returns minimal data for hover card
 * full: Returns comprehensive data
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

    // Check cache first
    let internetDBData: InternetDBResult | null = null;
    let cachedAt: number | null = null;

    const cachedResult = await db.execute({
      sql: 'SELECT * FROM osint_cache WHERE ip = ? AND source = ? AND expires_at > ?',
      args: [ip, 'internetdb', now],
    });

    if (cachedResult.rows.length > 0) {
      const cached = cachedResult.rows[0] as unknown as OsintCacheRecord;
      cachedAt = cached.fetched_at;
      internetDBData = {
        ip: cached.ip,
        ports: cached.ports ? JSON.parse(cached.ports) : [],
        hostnames: cached.hostnames ? JSON.parse(cached.hostnames) : [],
        tags: cached.tags ? JSON.parse(cached.tags) : [],
        vulns: cached.vulns ? JSON.parse(cached.vulns) : [],
        cpes: cached.cpes ? JSON.parse(cached.cpes) : [],
      };
    } else {
      // Fetch from InternetDB (free, no API key needed)
      const internetDB = getInternetDBClient();
      internetDBData = await internetDB.lookup(ip);
      cachedAt = now;

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

    // Build response
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
        last_scan: cachedAt ? new Date(cachedAt).toISOString() : null,
      };
      return NextResponse.json(response);
    }

    // Full mode
    const response: OsintFullResponse = {
      ip,
      reputation,
      ports,
      hostnames: internetDBData?.hostnames || [],
      tags,
      vulns,
      cpes: internetDBData?.cpes || [],
      cached_at: cachedAt ? new Date(cachedAt).toISOString() : null,
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
