import { NextResponse } from 'next/server';
import { ConcordiumClient } from '@/lib/concordium-client';

/**
 * GET /api/debug/grpc
 *
 * Debug endpoint to test gRPC connectivity
 */
export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    runtime: process.env.VERCEL ? 'vercel' : 'local',
  };

  try {
    const client = new ConcordiumClient('grpc.mainnet.concordium.software', 20000);

    const startTime = Date.now();
    const peers = await client.getPeersInfo();
    const duration = Date.now() - startTime;

    results.success = true;
    results.peersFound = peers.length;
    results.durationMs = duration;

    if (peers.length > 0) {
      results.samplePeer = {
        peerId: peers[0].peerId,
        ipAddress: peers[0].ipAddress,
        port: peers[0].port,
        isBootstrapper: peers[0].isBootstrapper,
      };
    }
  } catch (error) {
    results.success = false;
    results.error = error instanceof Error ? error.message : 'Unknown error';
    results.errorType = error?.constructor?.name;

    // Include stack trace in development
    if (process.env.NODE_ENV === 'development' && error instanceof Error) {
      results.stack = error.stack;
    }
  }

  return NextResponse.json(results);
}
