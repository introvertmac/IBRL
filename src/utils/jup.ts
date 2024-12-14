import { Connection, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { agentWallet } from './wallet';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface JupiterTokenInfo {
  extensions: {
    coingeckoId: string;
  };
  daily_volume: number;
}

interface SwapResult {
  status: 'success' | 'error';
  signature?: string;
  message?: string;
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

export async function swapSolToToken(
  amountInSol: number,
  outputMint: string = USDC_MINT,
  slippageBps: number = 50
): Promise<SwapResult> {
  try {
    const connection = await agentWallet.getActiveConnection();
    const walletInfo = await agentWallet.getBalance();
    
    // Check if we have enough balance
    if (walletInfo.balance < amountInSol) {
      return {
        status: 'error',
        message: 'insufficient_balance'
      };
    }

    // Convert SOL to lamports
    const amountInLamports = amountInSol * LAMPORTS_PER_SOL;

    // Get quote
    const quoteResponse = await (
      await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${outputMint}&amount=${amountInLamports}&slippageBps=${slippageBps}`)
    ).json();

    // Get swap transaction
    const { swapTransaction } = await (
      await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: walletInfo.address,
          wrapAndUnwrapSol: true
        })
      })
    ).json();

    // Deserialize and sign transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    
    // Sign using our wallet
    const signature = await agentWallet.signAndSendTransaction(transaction);

    return {
      status: 'success',
      signature
    };
  } catch (error) {
    console.error('Swap error:', error);
    return {
      status: 'error',
      message: 'transaction_failed'
    };
  }
}
