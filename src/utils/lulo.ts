interface LuloRate {
  CURRENT?: string;
  '1HR'?: string;
  '24HR'?: string;
  '7DAY'?: string;
  '30DAY'?: string;
}

interface ProtocolRates {
  rates: {
    [key: string]: LuloRate;
  };
  protocol: string;
}

interface LuloResponse {
  data: ProtocolRates[];
}

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const API_BASE_URL = typeof window !== 'undefined' 
  ? window.location.origin 
  : process.env.BOT_API_BASE_URL || 'http://localhost:3000';

export async function getUSDCLendingRates(): Promise<{
  rates: { protocol: string; rate: number }[];
  error?: string;
}> {
  try {
    const baseUrl = API_BASE_URL.replace('@', '');
    const response = await fetch(`${baseUrl}/api/lulo/rates`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as LuloResponse;
    
    const protocolsToInclude = ['drift', 'kamino_jlp', 'kamino', 'solend', 'kam_alt', 'marginfi'];
    
    const rates = data.data
      .filter(item => protocolsToInclude.includes(item.protocol))
      .map(item => ({
        protocol: item.protocol,
        rate: parseFloat(item.rates[USDC_MINT]?.CURRENT || '0')
      }))
      .filter(item => item.rate > 0)
      .sort((a, b) => b.rate - a.rate);

    return { rates };
  } catch (error) {
    console.error('Error fetching Lulo rates:', error);
    return { 
      rates: [],
      error: error instanceof Error ? error.message : 'Failed to fetch lending rates'
    };
  }
}
