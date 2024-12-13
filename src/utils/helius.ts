import { getSolanaPrice } from "./coingecko";

interface BalanceResponse {
  balance: number;
  balanceInUSD: number;
}

interface TransactionDetail {
  type: string;
  timestamp: string;
  status: string;
  amount?: number;
  sender?: string;
  receiver?: string;
  fee?: number;
  tokenTransfer?: {
    amount: number;
    symbol: string;
    tokenAddress?: string;
  };
}

interface TokenAmount {
  uiAmount: number | null;
  uiTokenSymbol: string | null;
}

interface TokenBalance {
  accountIndex: number;
  uiTokenAmount: TokenAmount;
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

export async function getTransactionDetails(signature: string): Promise<TransactionDetail> {
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
        id: 'tx-request',
        method: 'getTransaction',
        params: [
          signature,
          { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Helius API error: ${data.error.message}`);
    }

    const tx = data.result;
    if (!tx) {
      throw new Error('Transaction not found');
    }

    // Parse token transfers with better detection
    let tokenTransfer;
    if (tx.meta?.postTokenBalances?.length > 0 || tx.meta?.preTokenBalances?.length > 0) {
      const postBalances = tx.meta.postTokenBalances as TokenBalance[] || [];
      const preBalances = tx.meta.preTokenBalances as TokenBalance[] || [];
      
      for (let i = 0; i < Math.max(postBalances.length, preBalances.length); i++) {
        const postBalance = postBalances[i];
        const preBalance = preBalances.find((pre: TokenBalance) => pre.accountIndex === postBalance?.accountIndex);
        
        if (postBalance?.uiTokenAmount && preBalance?.uiTokenAmount) {
          const amount = Math.abs(
            (postBalance.uiTokenAmount.uiAmount || 0) - 
            (preBalance.uiTokenAmount.uiAmount || 0)
          );
          
          if (amount > 0) {
            const tokenAddress = tx.transaction?.message?.accountKeys?.[postBalance.accountIndex];
            tokenTransfer = {
              amount,
              symbol: postBalance.uiTokenAmount.uiTokenSymbol || '',
              tokenAddress
            };
            break;
          }
        }
      }
    }

    return {
      type: tx.meta?.type || 'Unknown',
      timestamp: new Date(tx.blockTime * 1000).toLocaleString(),
      status: tx.meta?.err ? 'Failed' : 'Success',
      amount: (tx.meta?.postBalances?.[0] || 0) - (tx.meta?.preBalances?.[0] || 0),
      fee: tx.meta?.fee ? tx.meta.fee / 1e9 : undefined,
      sender: tx.transaction?.message?.accountKeys?.[0],
      receiver: tx.transaction?.message?.accountKeys?.[1],
      tokenTransfer
    };
  } catch (error) {
    console.error('Error fetching transaction details:', error);
    throw error;
  }
}
