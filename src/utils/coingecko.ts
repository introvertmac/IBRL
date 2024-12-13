interface TokenPrice {
  price: number;
  price_change_24h: number;
  market_cap: number;
}

interface TrendingToken {
  id: string;
  name: string;
  symbol: string;
  price: number;
  price_change_24h: number;
}

// Add rate limiting helper
const rateLimiter = {
  lastRequest: 0,
  minInterval: 1000, // 1 second between requests
  
  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    if (timeSinceLastRequest < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastRequest));
    }
    this.lastRequest = Date.now();
  }
};

export async function getSolanaPrice(): Promise<TokenPrice> {
  await rateLimiter.throttle();
  
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true&include_market_cap=true',
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );
    
    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }
    
    if (!response.ok) {
      throw new Error(`HTTP_ERROR_${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      price: data.solana?.usd || 0,
      price_change_24h: data.solana?.usd_24h_change || 0,
      market_cap: data.solana?.usd_market_cap || 0
    };
  } catch (error: any) {
    console.error('Error fetching Solana price:', error);
    throw error;
  }
}

export async function getTrendingSolanaTokens(): Promise<TrendingToken[]> {
  await rateLimiter.throttle();
  
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=solana-meme-coins&order=market_cap_desc&per_page=5&page=1&sparkline=false',
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );
    
    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }

    if (!response.ok) {
      throw new Error(`HTTP_ERROR_${response.status}`);
    }
    
    const data = await response.json();
    
    return data.map((coin: any) => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol.toUpperCase(),
      price: coin.current_price || 0,
      price_change_24h: coin.price_change_percentage_24h || 0
    }));
  } catch (error) {
    console.error('Error fetching trending tokens:', error);
    throw error;
  }
}
