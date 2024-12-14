interface JupiterTokenInfo {
  extensions: {
    coingeckoId: string;
  };
  daily_volume: number;
}

export async function getTokenInfo(mintAddress: string): Promise<{ coingeckoId: string; dailyVolume: number } | null> {
  try {
    const response = await fetch(`https://tokens.jup.ag/token/${mintAddress}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as JupiterTokenInfo;
    
    return {
      coingeckoId: data.extensions.coingeckoId,
      dailyVolume: data.daily_volume
    };
  } catch (error) {
    console.error('Error fetching Jupiter token info:', error);
    throw error;
  }
}
