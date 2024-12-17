interface BirdeyeToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
  liquidity: number;
  v24hChangePercent: number;
  v24hUSD: number;
  mc: number;
}

interface BirdeyeResponse {
  success: boolean;
  data: {
    updateUnixTime: number;
    updateTime: string;
    tokens: BirdeyeToken[];
    total: number;
  };
}

function getBirdeyeApiKey(): string {
  const apiKey = process.env.NEXT_PUBLIC_BIRDEYE_API_KEY;
  if (!apiKey) {
    throw new Error('BIRDEYE_API_KEY is not configured');
  }
  return apiKey;
}

export async function getTrendingTokens(limit: number = 10): Promise<BirdeyeToken[]> {
  try {
    const response = await fetch(
      `https://public-api.birdeye.so/defi/tokenlist?sort_by=v24hChangePercent&sort_type=desc&offset=0&limit=${limit}`,
      {
        headers: {
          'accept': 'application/json',
          'x-chain': 'solana',
          'X-API-KEY': getBirdeyeApiKey()
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as BirdeyeResponse;

    if (!data.success) {
      throw new Error('Birdeye API request failed');
    }

    return data.data.tokens;
  } catch (error) {
    console.error('Error fetching Birdeye trending tokens:', error);
    throw error;
  }
}