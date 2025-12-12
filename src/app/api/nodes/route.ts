import { NextResponse } from 'next/server';

const CONCORDIUM_API = 'https://dashboard.mainnet.concordium.software/nodesSummary';

export async function GET() {
  try {
    const response = await fetch(CONCORDIUM_API, {
      next: { revalidate: 10 }, // Cache for 10 seconds
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Concordium API returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch from Concordium API:', error);
    return NextResponse.json({ error: 'Failed to fetch node data' }, { status: 500 });
  }
}
