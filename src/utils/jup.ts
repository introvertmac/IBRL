import { Connection, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { agentWallet } from './wallet';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

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
    const amountInLamports = Math.round(amountInSol * LAMPORTS_PER_SOL);
    
    console.log('Requesting quote:', {
      inputMint: SOL_MINT,
      outputMint,
      amountInLamports,
      amountInSol
    });

    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${outputMint}&amount=${amountInLamports}&slippageBps=50`;
    console.log('Quote URL:', quoteUrl);

    const response = await fetch(quoteUrl);
    const responseText = await response.text();
    console.log('Raw response:', responseText);
    
    if (!response.ok) {
      console.error('Quote API error:', responseText);
      return null;
    }

    const data = JSON.parse(responseText);
    console.log('Parsed quote response:', data);
    
    if (!data || !data.outAmount) {
      console.error('Invalid quote response:', data);
      return null;
    }

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
    const quote = await getSwapQuote(amountInSol, outputMint);
    if (!quote) {
      return { status: 'error', message: 'quote_failed' };
    }

    const outputAmount = parseInt(quote.outAmount) / (outputMint === USDC_MINT ? 1000000 : LAMPORTS_PER_SOL);

    console.log('Swap Quote:', {
      inputAmount: `${amountInSol} SOL`,
      outputAmount: `${outputAmount.toFixed(6)} ${outputMint === USDC_MINT ? 'USDC' : 'SOL'}`,
      priceImpact: `${parseFloat(quote.priceImpactPct).toFixed(2)}%`,
      route: quote.routePlan.map((r) => r.swapInfo.label).join(' → '),
    });

    const walletInfo = await agentWallet.getBalance();
    if (!walletInfo || walletInfo.balance < amountInSol) {
      return { status: 'error', message: 'insufficient_balance', quote };
    }

    const response = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: walletInfo.address,
        wrapUnwrapSOL: true,
        computeUnitPriceMicroLamports: 'auto',
        asLegacyTransaction: false,
      }),
    });

    if (!response.ok) {
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
    return { status: 'error', message: error instanceof Error ? error.message : 'transaction_failed' };
  }
}
