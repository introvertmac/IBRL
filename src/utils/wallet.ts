import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as bip39 from 'bip39';

interface WalletBalance {
  balance: number;
  address: string;
}

interface TransactionResult {
  signature: string;
  status: 'success' | 'error';
  message: string;
}

class AgentWallet {
  private keypair: Keypair | null = null;
  private connection: Connection | null = null;

  private initialize() {
    if (this.keypair && this.connection) return;

    if (typeof window === 'undefined') {
      // Skip initialization during build/SSR
      return;
    }

    const mnemonic = process.env.NEXT_PUBLIC_WALLET_MNEMONIC;
    const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;

    if (!mnemonic || !apiKey) {
      const missingVars = [];
      if (!mnemonic) missingVars.push('NEXT_PUBLIC_WALLET_MNEMONIC');
      if (!apiKey) missingVars.push('NEXT_PUBLIC_HELIUS_API_KEY');
      
      throw new Error(
        `Missing required environment variables: ${missingVars.join(', ')}. ` +
        'Please check your .env.local file and ensure all required variables are set.'
      );
    }

    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error(
        'Invalid wallet mnemonic provided. ' +
        'Please ensure your NEXT_PUBLIC_WALLET_MNEMONIC is a valid 12-word BIP39 mnemonic phrase.'
      );
    }

    try {
      const seed = bip39.mnemonicToSeedSync(mnemonic);
      this.keypair = Keypair.fromSeed(Uint8Array.from(seed).subarray(0, 32));
    } catch (error) {
      throw new Error(
        'Failed to generate wallet keypair from mnemonic. ' +
        'Please check your mnemonic phrase and try again.'
      );
    }

    try {
      this.connection = new Connection(
        `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
        'confirmed'
      );
    } catch (error) {
      throw new Error(
        'Failed to establish Helius RPC connection. ' +
        'Please verify your NEXT_PUBLIC_HELIUS_API_KEY is valid.'
      );
    }
  }
  

  async getBalance(): Promise<WalletBalance> {
    this.initialize();
    if (!this.keypair || !this.connection) {
      throw new Error('Wallet not initialized');
    }
    const balance = await this.connection.getBalance(this.keypair.publicKey);
    return {
      balance: balance / LAMPORTS_PER_SOL,
      address: this.keypair.publicKey.toString()
    };
  }

  async sendSOL(recipient: string, amount: number): Promise<TransactionResult> {
    this.initialize();
    if (!this.keypair || !this.connection) {
      throw new Error('Wallet not initialized');
    }
    try {
      const balance = await this.connection.getBalance(this.keypair.publicKey);
      if (balance < amount * LAMPORTS_PER_SOL) {
        return {
          signature: '',
          status: 'error',
          message: 'insufficient_balance'
        };
      }

      const recipientPubKey = new PublicKey(recipient);
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.keypair.publicKey,
          toPubkey: recipientPubKey,
          lamports: amount * LAMPORTS_PER_SOL
        })
      );

      const signature = await this.connection.sendTransaction(
        transaction,
        [this.keypair]
      );

      await this.connection.confirmTransaction(signature);

      return {
        signature,
        status: 'success',
        message: 'success'
      };
    } catch (error) {
      return {
        signature: '',
        status: 'error',
        message: 'transaction_failed'
      };
    }
  }
}

export const agentWallet = new AgentWallet();
