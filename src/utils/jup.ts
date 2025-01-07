import { Connection, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { agentWallet } from './wallet';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const IBRLC_MINT = '7wxyV4i7iZvayjGN9bXkgJMRnPcnwWnQTPtd9KWjN3vM';

interface JupiterTokenInfo {
  extensions: {
    coingeckoId: string;
  };
  daily_volume: number;
  symbol: string;
  name: string;
  price: number;
}

interface SwapInfo {
  ammKey: string;
  label: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
}

interface RoutePlan {
  swapInfo: SwapInfo;
  percent: number;
}

interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  marketInfos: any[];
  swapMode: string;
  otherAmountThreshold: string;
  routePlan: RoutePlan[];
  contextSlot?: number;
  timeTaken?: number;
}

interface SwapResult {
  status: 'success' | 'error' | 'pending_confirmation';
  signature?: string;
  message?: string;
  quote?: SwapQuote;
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

export async function getSwapQuote(
  amountInSol: number,
  outputMint: string = USDC_MINT
): Promise<SwapQuote | null> {
  try {
    const slippageBps = outputMint === IBRLC_MINT ? 1000 : 50;
    const inputAmount = (amountInSol * LAMPORTS_PER_SOL).toString();
    
    const queryParams = new URLSearchParams({
      inputMint: SOL_MINT,
      outputMint,
      amount: inputAmount,
      slippageBps: slippageBps.toString(),
      onlyDirectRoutes: (outputMint === IBRLC_MINT).toString(),
      asLegacyTransaction: 'false'
    });

    const response = await fetch(`https://quote-api.jup.ag/v6/quote?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Jupiter quote error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        params: {
          inputMint: SOL_MINT,
          outputMint,
          amount: amountInSol,
          slippageBps
        }
      });
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting swap quote:', error);
    return null;
  }
}

export async function swapSolToToken(
  amountInSol: number,
  outputMint: string = USDC_MINT
): Promise<SwapResult> {
  try {
    // Increase minimum amount for IBRLC due to liquidity constraints
    if (outputMint === IBRLC_MINT && amountInSol < 0.01) {
      return { 
        status: 'error', 
        message: 'minimum_amount_not_met',
        quote: undefined
      };
    }

    const quote = await getSwapQuote(amountInSol, outputMint);
    if (!quote) {
      return { status: 'error', message: 'quote_failed' };
    }

    // Get token decimals based on mint
    const getTokenDecimals = (mint: string) => {
      switch (mint) {
        case USDC_MINT:
          return 1000000; // 6 decimals
        case IBRLC_MINT:
          return 1000000000; // 9 decimals
        default:
          return LAMPORTS_PER_SOL; // 9 decimals
      }
    };

    const outputDecimals = getTokenDecimals(outputMint);
    const outputAmount = parseInt(quote.outAmount) / outputDecimals;

    console.log('Swap Quote:', {
      inputAmount: `${amountInSol} SOL`,
      outputAmount: `${outputAmount.toFixed(6)} ${outputMint === USDC_MINT ? 'USDC' : outputMint === IBRLC_MINT ? 'IBRLC' : 'SOL'}`,
      priceImpact: `${parseFloat(quote.priceImpactPct).toFixed(2)}%`,
      route: quote.routePlan.map((r) => r.swapInfo.label).join(' → '),
    });

    const walletInfo = await agentWallet.getBalance();
    if (!walletInfo || walletInfo.balance < amountInSol) {
      return { status: 'error', message: 'insufficient_balance', quote };
    }

    const response = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: walletInfo.address,
        wrapUnwrapSOL: true,
        computeUnitPriceMicroLamports: 'auto',
        asLegacyTransaction: false,
      }),
    });

    // Add better error handling
    if (!response.ok) {
      console.error('Swap API error:', await response.text());
      throw new Error(`Swap request failed: ${response.statusText}`);
    }

    const { swapTransaction } = await response.json();

    // Ensure swapTransaction is a base64 string and decode it
    const transactionBuffer = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBuffer);

    const signature = await agentWallet.signAndSendTransaction(transaction);

    return { status: 'success', signature, quote };
  } catch (error) {
    console.error('Swap error:', error);
    return { 
      status: 'error', 
      message: error instanceof Error ? error.message : 'transaction_failed',
      quote: undefined
    };
  }
}
