import { NextRequest, NextResponse } from 'next/server';
import { searchByIP, requestScan, hasHttpPorts, buildScannableUrls } from '@/lib/webamon-client';

/**
 * GET /api/webamon?ip=x.x.x.x&ports=80,443,8080
 * Search for existing Webamon scans for an IP
 */
export async function GET(request: NextRequest) {
  const ip = request.nextUrl.searchParams.get('ip');
  const portsParam = request.nextUrl.searchParams.get('ports');

  if (!ip) {
    return NextResponse.json({ error: 'IP parameter required' }, { status: 400 });
  }

  // Validate IP format
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) {
    return NextResponse.json({ error: 'Invalid IP format' }, { status: 400 });
  }

  // Parse ports if provided
  const ports = portsParam
    ? portsParam.split(',').map((p) => parseInt(p.trim(), 10)).filter((p) => !isNaN(p))
    : [];

  // Check if IP has HTTP ports worth scanning
  const httpAvailable = ports.length > 0 ? hasHttpPorts(ports) : true;

  if (!httpAvailable) {
    return NextResponse.json({
      ip,
      scans: [],
      total: 0,
      http_available: false,
      message: 'No HTTP ports detected for this IP',
    });
  }

  // Search for existing scans
  const result = await searchByIP(ip);

  if (!result) {
    return NextResponse.json(
      { error: 'Failed to fetch Webamon data' },
      { status: 502 }
    );
  }

  // Build scannable URLs for the response
  const scannableUrls = ports.length > 0 ? buildScannableUrls(ip, ports) : [];

  return NextResponse.json({
    ip,
    scans: result.scans,
    total: result.total,
    http_available: true,
    scannable_urls: scannableUrls,
    cached_at: result.cached_at,
  });
}

/**
 * POST /api/webamon
 * Request a new scan for a URL
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL parameter required' }, { status: 400 });
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const scanId = await requestScan(url);

    if (!scanId) {
      return NextResponse.json(
        { error: 'Failed to initiate scan' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      scan_id: scanId,
      url,
      status: 'pending',
      message: 'Scan initiated successfully',
    });
  } catch (error) {
    console.error('[Webamon API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
