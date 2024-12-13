import { getSolanaPrice } from "./coingecko";

interface BalanceResponse {
  balance: number;
  balanceInUSD: number;
}

function getHeliusRpcUrl(): string {
  const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
  if (!apiKey) {
    throw new Error('HELIUS_API_KEY is not configured');
  }
  return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
}

const rateLimiter = {
  lastRequest: 0,
  minInterval: 100,
  
  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    if (timeSinceLastRequest < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastRequest));
    }
    this.lastRequest = Date.now();
  }
};

export async function getSolanaBalance(address: string): Promise<BalanceResponse> {
  if (!address) {
    throw new Error('Address is required');
  }

  await rateLimiter.throttle();

  try {
    const heliusUrl = getHeliusRpcUrl();
    
    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'balance-request',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: address,
          displayOptions: {
            showFungible: true,
            showNativeBalance: true,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Helius API error: ${data.error.message}`);
    }

    const balanceInSOL = Number(data.result?.nativeBalance?.lamports || 0) / 1e9;
    
    // Get SOL price using existing utility
    const priceData = await getSolanaPrice();
    
    return {
      balance: balanceInSOL,
      balanceInUSD: balanceInSOL * priceData.price
    };
  } catch (error) {
    console.error('Error in getSolanaBalance:', error);
    throw error;
  }
}
