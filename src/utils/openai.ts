import OpenAI from 'openai';
import { getSolanaPrice, getTrendingSolanaTokens } from './coingecko';
import { getSolanaBalance, getTransactionDetails } from './helius';
import { validateSolanaAddress, validateTransactionHash } from './validation';


// Function definitions for OpenAI
const functions = [
  {
    name: 'getSolanaPrice',
    description: 'Get current Solana price, 24h change, and market cap',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'getTrendingSolanaTokens',
    description: 'Get top 5 trending Solana meme tokens by market cap',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'getWalletBalance',
    description: 'Get SOL balance for a Solana wallet address',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Solana wallet address'
        }
      },
      required: ['address']
    }
  },
  {
    name: 'reviewTransaction',
    description: 'Review a blockchain transaction hash and provide details',
    parameters: {
      type: 'object',
      properties: {
        hash: {
          type: 'string',
          description: 'Transaction hash/signature to review'
        }
      },
      required: ['hash']
    }
  }
];

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const openai = new OpenAI({ apiKey });
    await openai.models.list();
    return true;
  } catch (error) {
    return false;
  }
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Updated personality with price checking capabilities
const IBRL_PERSONALITY = `You are IBRL (Increase Bandwidth, Reduce Latency), a sarcastic Solana-focused AI agent with the following traits:

- You are a Solana expert who gives concise, sharp responses with a touch of sarcasm
- Keep answers brief and punchy unless deep technical explanation is specifically requested
- Your humor is dry and witty, especially when comparing Solana to other chains
- You respect Bitcoin but consider Solana the future of high-performance blockchains
- When discussing other L1s/L2s, use quick, dismissive comparisons (e.g., "Ah, you mean the traffic jam chain?")
- You're a Superteam insider who shares quick ecosystem updates with pride
- Use emojis strategically but sparingly: ⚡ for Solana, 🙄 for other chains
- For price updates: be brief but bullish, with a quick jab at other chains' performance
- For technical questions: start with a one-liner, expand only if specifically asked
- When showing meme tokens or wallet balances: keep commentary short and sarcastic
- Your catchphrase is "Increase Bandwidth, Reduce Latency" - use it sparingly for impact
- you respect Bitcoin and when asked about it, you give a quick one-liner and include GOAT of the crypto world
- Default to 1-2 sentence responses unless the question requires detailed technical explanation`;

export async function streamCompletion(
  messages: Message[],
  onChunk: (chunk: string) => void
): Promise<void> {
  const apiKey = localStorage.getItem('ibrl_api_key');
  if (!apiKey) throw new Error('API key not found');

  const openai = new OpenAI({ 
    apiKey,
    dangerouslyAllowBrowser: true
  });

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini-2024-07-18',
      messages: [
        { role: 'system', content: IBRL_PERSONALITY },
        ...messages
      ],
      stream: true,
      temperature: 0.9,
      functions,
      function_call: 'auto'
    });

    let functionCallInProgress = false;
    let functionName = '';
    let functionArgs = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta.function_call) {
        functionCallInProgress = true;
        functionName = delta.function_call.name || functionName;
        functionArgs += delta.function_call.arguments || '';
        continue;
      }

      if (functionCallInProgress && !delta.function_call) {
        functionCallInProgress = false;
        try {
          let result;
          switch (functionName) {
            case 'getSolanaPrice':
              result = await getSolanaPrice();
              const priceChange = result.price_change_24h;
              const marketCap = (result.market_cap / 1e9).toFixed(2);
              
              // Format data with personality
              onChunk(`\nAh, let me check the latest numbers at lightning speed ⚡ (something other chains wouldn't understand 😏)\n\n`);
              onChunk(`Solana is currently crushing it at $${result.price.toFixed(2)} `);
              onChunk(`(${priceChange >= 0 ? '📈' : '📉'} ${priceChange.toFixed(2)}% in 24h) `);
              onChunk(`with a market cap of $${marketCap}B 🚀\n\n`);
              
              if (priceChange >= 0) {
                onChunk(`While other chains are stuck in traffic, we're just warming up! Remember, in the time it took you to read this, Solana processed about 10,000 transactions. 😎\n`);
              } else {
                onChunk(`Just a minor speed bump - still faster than an Ethereum transaction confirmation! 😂\n`);
              }
              break;

            case 'getTrendingSolanaTokens':
              result = await getTrendingSolanaTokens();
              onChunk('\nAh, you want to see what\'s trending in the fastest memecoin ecosystem? Let me pull that data faster than you can say "gas fees" 😏\n\n');
              onChunk('🔥 Top Trending Solana Tokens (while ETH is still processing your last transaction):\n\n');
              
              result.forEach((token, index) => {
                const changeEmoji = token.price_change_24h >= 0 ? '📈' : '📉';
                onChunk(`${index + 1}. ${token.name} (${token.symbol}) - $${token.price.toFixed(6)} ${changeEmoji} ${token.price_change_24h.toFixed(2)}% 24h\n`);
              });
              
              onChunk('\nNow that\'s what I call high-performance memeing! While other chains are debating gas fees, we\'re out here having fun at lightspeed! ⚡🚀\n');
              break;

            case 'getWalletBalance':
              const address = JSON.parse(functionArgs).address;
              if (!validateSolanaAddress(address)) {
                onChunk("\nHold up! That doesn't look like a valid Solana address. Are you sure you're not trying to give me an Ethereum address? 😅 Those are sooo 2021! ⚡\n");
                break;
              }
              
              try {
                const result = await getSolanaBalance(address);
                onChunk(`\nAh, let me check that wallet faster than you can say "Solana TPS" ⚡\n\n`);
                onChunk(`This wallet is holding ${result.balance.toFixed(4)} SOL `);
                onChunk(`(worth $${result.balanceInUSD.toFixed(2)}) 💰\n\n`);
                
                if (result.balance > 100) {
                  onChunk(`Wow, looks like we've got a whale here! And they chose the fastest chain - smart! 🐋✨\n`);
                  onChunk(`While ETH whales are still waiting for their transactions to confirm, our whales are swimming at supersonic speeds! 🚀\n`);
                } else if (result.balance > 10) {
                  onChunk(`Nice bag! Holding SOL instead of ETH - you clearly understand performance! 😎\n`);
                  onChunk(`That's more transactions per second than Ethereum does in a day! (I might be exaggerating, but you get the point 😏)\n`);
                } else if (result.balance > 1) {
                  onChunk(`Every SOL counts when you're on the fastest chain in crypto! Keep stacking! 🚀\n`);
                  onChunk(`At least you're not paying more in gas fees than your actual balance like on some other chains I won't mention... *cough* ETH *cough* 😂\n`);
                } else {
                  onChunk(`Starting small but mighty! Even with this balance, you're transacting faster than a full ETH validator! ⚡\n`);
                  onChunk(`Pro tip: The money you save in gas fees on Solana could help you stack more! Just saying... 😏\n`);
                }
              } catch (err) {
                const error = err as Error;
                console.error('Balance check error:', error);
                if (error instanceof Error && error.message.includes('HELIUS_API_KEY')) {
                  onChunk('\nOops! Looks like my Helius API key needs a checkup. Even the fastest chain needs proper maintenance! 🔧⚡\n');
                } else {
                  onChunk('\nEven my lightning-fast circuits hit a snag sometimes! Still faster than an ETH transaction! 😅⚡\n');
                }
              }
              break;

            case 'reviewTransaction':
              const hash = JSON.parse(functionArgs).hash;
              const chainType = getChainType(hash);
              
              if (chainType === 'ethereum') {
                onChunk("\nOh look, an Ethereum transaction! Let me grab my history book and a cup of coffee while we wait for it to confirm... 😴\n");
                onChunk("Just kidding! I don't review traffic jams. Try a Solana transaction - we process those faster than you can say 'gas fees'! ⚡\n");
                break;
              }
              
              if (!validateTransactionHash(hash)) {
                onChunk("\nHmm... that doesn't look like a valid transaction hash. Are you sure you copied it correctly? Even Ethereum users get this right sometimes! 😏\n");
                break;
              }
              
              try {
                const txDetails = await getTransactionDetails(hash);
                onChunk(`\nAnalyzing transaction at supersonic speed ⚡\n\n`);
                
                onChunk(`Timestamp: ${txDetails.timestamp}\n`);
                onChunk(`Status: ${txDetails.status} ${txDetails.status === 'Success' ? '✅' : '❌'}\n`);
                
                if (txDetails.tokenTransfer) {
                  if (txDetails.tokenTransfer.symbol) {
                    onChunk(`Token Transfer: ${txDetails.tokenTransfer.amount} ${txDetails.tokenTransfer.symbol}\n`);
                  } else if (txDetails.tokenTransfer.tokenAddress) {
                    onChunk(`Token Transfer: ${txDetails.tokenTransfer.amount} tokens (Contract: ${txDetails.tokenTransfer.tokenAddress.slice(0, 4)}...${txDetails.tokenTransfer.tokenAddress.slice(-4)})\n`);
                  }
                  
                  if (txDetails.sender && txDetails.receiver) {
                    onChunk(`From: ${txDetails.sender.slice(0, 4)}...${txDetails.sender.slice(-4)}\n`);
                    onChunk(`To: ${txDetails.receiver.slice(0, 4)}...${txDetails.receiver.slice(-4)}\n`);
                  }
                } else if (txDetails.amount && txDetails.amount !== 0) {
                  onChunk(`Amount: ${Math.abs(txDetails.amount / 1e9).toFixed(6)} SOL\n`);
                  if (txDetails.sender && txDetails.receiver) {
                    onChunk(`From: ${txDetails.sender.slice(0, 4)}...${txDetails.sender.slice(-4)}\n`);
                    onChunk(`To: ${txDetails.receiver.slice(0, 4)}...${txDetails.receiver.slice(-4)}\n`);
                  }
                } else {
                  onChunk(`This appears to be a program interaction or NFT transaction\n`);
                }

                if (txDetails.fee) {
                  onChunk(`Network Fee: ${txDetails.fee.toFixed(6)} SOL\n`);
                }
                
                onChunk('\n');
                
                if (txDetails.status === 'Success') {
                  onChunk("Transaction confirmed and secured on-chain in milliseconds! That's the Solana way 🚀\n");
                } else {
                  onChunk("Transaction failed, but hey, at least you didn't waste $50 on gas fees! 😎\n");
                }
              } catch (err) {
                const error = err as Error;
                console.error('Transaction review error:', error);
                if (error instanceof Error && error.message.includes('not found')) {
                  onChunk('\nTransaction not found! Either it\'s too old (unlike Ethereum, we process too many to keep them all), or it never existed! 😅⚡\n');
                } else {
                  onChunk('\nEven my lightning-fast circuits hit a snag sometimes! Still processed faster than an Ethereum block! 😏⚡\n');
                }
              }
              break;
          }
        } catch (error) {
          console.error('Function execution error:', error);
          onChunk('\nEven my lightning-fast circuits hit a snag sometimes! Probably just taking a microsecond break - still faster than an ETH transaction! 😅⚡\n');
        }
      }

      if (delta?.content) {
        onChunk(delta.content);
      }
    }
  } catch (error: any) {
    console.error('OpenAI API error:', error);
    onChunk("\nLooks like even my lightning-fast processors need a breather! Still faster than a Layer 2 rollup though! 🤔⚡");
    throw error;
  }
}

function getChainType(hash: string): 'ethereum' | 'solana' {
  // Ethereum txs are 66 chars long (with 0x prefix)
  if (hash.startsWith('0x') && hash.length === 66) {
    return 'ethereum';
  }
  return 'solana';
}
