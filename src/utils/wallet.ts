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

export class AgentWallet {
  private primaryConnection: Connection | null = null;
  private fallbackConnection: Connection | null = null;
  private isUsingFallback: boolean = false;
  private baseUrl: string;

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

    // Use appropriate base URL depending on environment
    this.baseUrl = process.env.BOT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
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

  async getBalance(): Promise<{ address: string; balance: number }> {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        const response = await fetch(`${this.baseUrl}/api/wallet`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to get wallet balance');
        }

        return await response.json();
      } catch (error) {
        retryCount++;
        if (retryCount === maxRetries) {
          console.error('Error getting wallet balance after retries:', error);
          throw error;
        }
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    throw new Error('Failed to get wallet balance after retries');
  }

  async sendSOL(recipient: string, amount: number): Promise<TransactionResult> {
    try {
      const connection = await this.getActiveConnection();
      const response = await fetch(`${this.baseUrl}/api/wallet/send`, {
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
      const connection = new Connection(
        process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
        {
          httpHeaders: {
            'Content-Type': 'application/json',
          },
          commitment: 'confirmed',
          wsEndpoint: undefined, // Disable WebSocket
          fetch: (input: RequestInfo | URL, init?: RequestInit) => {
            return fetch(input, {
              ...init
            });
          },
        }
      );
      const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
      
      const response = await fetch(`${this.baseUrl}/api/wallet/sign`, {
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
