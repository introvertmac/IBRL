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
  private keypair: Keypair;
  private connection: Connection;

  constructor() {
    const mnemonic = process.env.NEXT_PUBLIC_WALLET_MNEMONIC;
    const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
    if (!mnemonic) {
      throw new Error('Wallet mnemonic not configured');
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    this.keypair = Keypair.fromSeed(Uint8Array.from(seed).subarray(0, 32));
    this.connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
      'confirmed'
    );
  }
  

  async getBalance(): Promise<WalletBalance> {
    const balance = await this.connection.getBalance(this.keypair.publicKey);
    return {
      balance: balance / LAMPORTS_PER_SOL,
      address: this.keypair.publicKey.toString()
    };
  }

  async sendSOL(recipient: string, amount: number): Promise<TransactionResult> {
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
