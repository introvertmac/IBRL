import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://app.lulo.fi/api/protocols/rates?cluster=mainnet', {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 60 } // Cache for 60 seconds
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Lulo API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lending rates' },
      { status: 500 }
    );
  }
}
