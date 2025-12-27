import { NextResponse } from 'next/server';
import { getDbClient, initializeSchema } from '@/lib/db/client';
import { getShodanClient, type ShodanSearchResult } from '@/lib/shodan-client';

// Vercel cron authentication
const CRON_SECRET = process.env.CRON_SECRET;

// Cache TTL: 30 days in seconds
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Refresh Shodan port:20000 search results
 * Should be run weekly via cron to stay under 100 queries/month
 *
 * GET /api/cron/refresh-shodan
 */
export async function GET(request: Request) {
  // Verify cron secret in production
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const db = getDbClient();
    await initializeSchema();

    const shodan = getShodanClient();

    // Check current credits
    const accountInfo = await shodan.accountInfo();
    console.log(`Shodan credits remaining: ${accountInfo.query_credits}`);

    if (accountInfo.query_credits < 5) {
      return NextResponse.json({
        error: 'Insufficient Shodan credits',
        credits: accountInfo.query_credits,
      }, { status: 429 });
    }

    // Check if we have recent data (less than 7 days old)
    const recentCheck = await db.execute({
      sql: 'SELECT MAX(cached_at) as latest FROM shodan_scans',
      args: [],
    });

    const latestCacheTime = recentCheck.rows[0]?.latest as number | null;
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

    if (latestCacheTime && latestCacheTime > sevenDaysAgo) {
      const daysOld = Math.floor((now - latestCacheTime) / (24 * 60 * 60 * 1000));
      return NextResponse.json({
        message: 'Cache is still fresh',
        cached_at: new Date(latestCacheTime).toISOString(),
        days_old: daysOld,
        next_refresh: new Date(latestCacheTime + (7 * 24 * 60 * 60 * 1000)).toISOString(),
      });
    }

    // Search for port 20000 (Concordium gRPC default)
    console.log('Searching Shodan for port:20000...');
    const results = await shodan.searchAll('port:20000', 20);
    console.log(`Found ${results.length} results`);

    // Also search for port 8888 (Concordium P2P)
    console.log('Searching Shodan for port:8888...');
    const p2pResults = await shodan.searchAll('port:8888', 10);
    console.log(`Found ${p2pResults.length} P2P results`);

    // Merge results by IP
    const ipMap = new Map<string, ShodanSearchResult>();

    for (const result of [...results, ...p2pResults]) {
      const existing = ipMap.get(result.ip_str);
      if (existing) {
        // Merge data
        if (result.hostnames) {
          existing.hostnames = [...new Set([...(existing.hostnames || []), ...result.hostnames])];
        }
        if (result.vulns) {
          existing.vulns = [...new Set([...(existing.vulns || []), ...result.vulns])];
        }
      } else {
        ipMap.set(result.ip_str, result);
      }
    }

    // Store in database
    const cachedAt = Date.now();
    let upsertCount = 0;

    for (const [ip, result] of ipMap) {
      await db.execute({
        sql: `
          INSERT INTO shodan_scans (
            ip, ports, hostnames, org, isp, asn, country_code, city,
            vulns, product, os, last_updated, cached_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(ip) DO UPDATE SET
            ports = excluded.ports,
            hostnames = excluded.hostnames,
            org = excluded.org,
            isp = excluded.isp,
            asn = excluded.asn,
            country_code = excluded.country_code,
            city = excluded.city,
            vulns = excluded.vulns,
            product = excluded.product,
            os = excluded.os,
            last_updated = excluded.last_updated,
            cached_at = excluded.cached_at
        `,
        args: [
          ip,
          JSON.stringify([result.port]),
          result.hostnames ? JSON.stringify(result.hostnames) : null,
          result.org || null,
          result.isp || null,
          result.asn || null,
          result.country_code || null,
          result.city || null,
          result.vulns ? JSON.stringify(result.vulns) : null,
          result.product || null,
          result.os || null,
          result.timestamp ? new Date(result.timestamp).getTime() : null,
          cachedAt,
        ],
      });
      upsertCount++;
    }

    // Clean up expired entries (older than 30 days)
    const expiryCutoff = Date.now() - (CACHE_TTL_SECONDS * 1000);
    const cleanupResult = await db.execute({
      sql: 'DELETE FROM shodan_scans WHERE cached_at < ?',
      args: [expiryCutoff],
    });

    // Get updated account info
    const updatedAccountInfo = await shodan.accountInfo();

    return NextResponse.json({
      success: true,
      results_found: ipMap.size,
      records_upserted: upsertCount,
      expired_cleaned: cleanupResult.rowsAffected,
      credits_used: accountInfo.query_credits - updatedAccountInfo.query_credits,
      credits_remaining: updatedAccountInfo.query_credits,
      cached_at: new Date(cachedAt).toISOString(),
    });
  } catch (error) {
    console.error('Shodan refresh failed:', error);
    return NextResponse.json({
      error: 'Shodan refresh failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
