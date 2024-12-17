import { Connection, VersionedTransaction } from '@solana/web3.js';

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
  private primaryConnection: Connection | null = null;
  private fallbackConnection: Connection | null = null;
  private isUsingFallback: boolean = false;

  constructor() {
    const quickNodeUrl = process.env.NEXT_PUBLIC_QUICKNODE_RPC_URL;
    const heliusApiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;

    if (!quickNodeUrl && !heliusApiKey) {
      throw new Error('Missing RPC configuration');
    }

    // Initialize QuickNode as primary if available
    if (quickNodeUrl) {
      this.primaryConnection = new Connection(quickNodeUrl, 'confirmed');
    }

    // Initialize Helius as fallback
    if (heliusApiKey) {
      this.fallbackConnection = new Connection(
        `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
        'confirmed'
      );
    }

    // If QuickNode isn't available, use Helius as primary
    if (!quickNodeUrl && heliusApiKey) {
      this.primaryConnection = this.fallbackConnection;
    }
  }

  public async getActiveConnection(): Promise<Connection> {
    if (!this.isUsingFallback) {
      try {
        if (!this.primaryConnection) {
          throw new Error('Primary connection not initialized');
        }
        await this.primaryConnection.getSlot();
        return this.primaryConnection;
      } catch (error) {
        console.warn('Primary RPC failed, switching to fallback:', error);
        this.isUsingFallback = true;
      }
    }

    if (!this.fallbackConnection) {
      throw new Error('Fallback connection not initialized');
    }
    try {
      await this.fallbackConnection.getSlot();
      return this.fallbackConnection;
    } catch (error) {
      console.error('Both RPC connections failed:', error);
      throw new Error('No available RPC connection');
    }
  }

  async getBalance(): Promise<WalletBalance> {
    try {
      const connection = await this.getActiveConnection();
      const response = await fetch('/api/wallet');
      
      if (!response.ok) {
        throw new Error('Failed to fetch wallet balance');
      }
      
      return response.json();
    } catch (error) {
      console.error('Error getting balance:', error);
      throw error;
    }
  }

  async sendSOL(recipient: string, amount: number): Promise<TransactionResult> {
    try {
      const connection = await this.getActiveConnection();
      const response = await fetch('/api/wallet/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          recipient, 
          amount,
          rpcUrl: this.isUsingFallback ? 'helius' : 'quicknode' 
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send transaction');
      }

      return response.json();
    } catch (error) {
      console.error('Error sending SOL:', error);
      throw error;
    }
  }

  async signAndSendTransaction(transaction: VersionedTransaction): Promise<string> {
    try {
      const connection = await this.getActiveConnection();
      const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
      
      const response = await fetch('/api/wallet/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transaction: serializedTransaction,
          rpcUrl: this.isUsingFallback ? 'helius' : 'quicknode' 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sign and send transaction');
      }

      const result = await response.json();
      return result.signature;
    } catch (error) {
      console.error('Error signing transaction:', error);
      throw error;
    }
  }

  public async getAddress(): Promise<string> {
    const walletInfo = await this.getBalance();
    return walletInfo.address;
  }
}

// Export a singleton instance
export const agentWallet = new AgentWallet();
