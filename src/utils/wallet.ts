import { Connection } from '@solana/web3.js';

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
  private connection: Connection;

  constructor() {
    const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
    if (!apiKey) {
      throw new Error('Missing Helius API key');
    }
    
    this.connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
      'confirmed'
    );
  }

  async getBalance(): Promise<WalletBalance> {
    const response = await fetch('/api/wallet');
    if (!response.ok) {
      throw new Error('Failed to fetch wallet balance');
    }
    return response.json();
  }

  async sendSOL(recipient: string, amount: number): Promise<TransactionResult> {
    // For sending SOL, we'll need to create another API endpoint
    const response = await fetch('/api/wallet/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient, amount }),
    });

    if (!response.ok) {
      throw new Error('Failed to send transaction');
    }

    return response.json();
  }
}

export const agentWallet = new AgentWallet();
