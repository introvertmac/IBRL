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

interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  marketInfos: any[];
  swapMode: string;
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
    const amountInLamports = amountInSol * LAMPORTS_PER_SOL;
    const response = await fetch(
      `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${outputMint}&amount=${amountInLamports}&slippageBps=50`
    );
    
    if (!response.ok) return null;
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting swap quote:', error);
    return null;
  }
}

export async function swapSolToToken(
  amountInSol: number,
  outputMint: string = USDC_MINT,
  userConfirmed: boolean = false
): Promise<SwapResult> {
  try {
    if (!userConfirmed) {
      return {
        status: 'pending_confirmation',
        message: 'waiting_for_confirmation'
      };
    }

    const quote = await getSwapQuote(amountInSol, outputMint);
    if (!quote) {
      return {
        status: 'error',
        message: 'quote_failed'
      };
    }

    const walletInfo = await agentWallet.getBalance();
    if (walletInfo.balance < amountInSol) {
      return {
        status: 'error',
        message: 'insufficient_balance',
        quote
      };
    }

    // Get swap transaction
    const { swapTransaction } = await (
      await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: walletInfo.address,
          wrapAndUnwrapSol: true
        })
      })
    ).json();

    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    const signature = await agentWallet.signAndSendTransaction(transaction);

    return {
      status: 'success',
      signature,
      quote
    };
  } catch (error) {
    console.error('Swap error:', error);
    return {
      status: 'error',
      message: 'transaction_failed'
    };
  }
}
