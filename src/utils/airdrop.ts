import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { validateSolanaAddress } from './validation';

const DEVNET_CONNECTION = new Connection('https://muddy-blissful-choice.solana-devnet.quiknode.pro/ab38149854705180123ffb497c8bcf760b5877ea');
const AIRDROP_AMOUNT = 1 * LAMPORTS_PER_SOL; // 1 SOL

interface AirdropResult {
  status: 'success' | 'error';
  signature?: string;
  message?: 'invalid_address' | 'daily_limit_reached' | 'airdrop_failed';
}

export async function requestDevnetAirdrop(address: string): Promise<AirdropResult> {
  try {
    if (!validateSolanaAddress(address)) {
      return {
        status: 'error',
        message: 'invalid_address'
      };
    }

    const signature = await DEVNET_CONNECTION.requestAirdrop(
      new PublicKey(address),
      AIRDROP_AMOUNT
    );

    await DEVNET_CONNECTION.confirmTransaction(signature);

    return {
      status: 'success',
      signature
    };
  } catch (error: any) {
    console.error('Airdrop error:', error);
    
    // Check for daily limit error
    if (error?.message?.includes('airdrop request limit reached')) {
      return {
        status: 'error',
        message: 'daily_limit_reached'
      };
    }

    return {
      status: 'error',
      message: 'airdrop_failed'
    };
  }
}
