import { NextResponse } from 'next/server';
import * as bip39 from 'bip39';
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';

export async function GET() {
  try {
    const mnemonic = process.env.WALLET_MNEMONIC;
    const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;

    if (!mnemonic || !apiKey) {
      throw new Error('Missing environment variables');
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const keypair = Keypair.fromSeed(Uint8Array.from(seed).subarray(0, 32));
    
    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
      'confirmed'
    );

    const balance = await connection.getBalance(keypair.publicKey);

    return NextResponse.json({
      balance: balance / LAMPORTS_PER_SOL,
      address: keypair.publicKey.toString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch wallet info' },
      { status: 500 }
    );
  }
}
