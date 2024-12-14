import OpenAI from 'openai';
import { getSolanaPrice, getTrendingSolanaTokens } from './coingecko';
import { getSolanaBalance, getTransactionDetails } from './helius';
import { validateSolanaAddress, validateTransactionHash } from './validation';
import { agentWallet } from './wallet';


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
  },
  {
    name: 'getAgentBalance',
    description: 'Get the SOL balance of the agent\'s wallet',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'sendSOL',
    description: 'Send SOL from agent wallet to specified address',
    parameters: {
      type: 'object',
      properties: {
        recipient: {
          type: 'string',
          description: 'Recipient Solana address'
        },
        amount: {
          type: 'number',
          description: 'Amount of SOL to send'
        }
      },
      required: ['recipient', 'amount']
    }
  }
];

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const openai = new OpenAI({ 
      apiKey,
      dangerouslyAllowBrowser: true 
    });
    
    // Make a lightweight API call to verify the key
    const response = await openai.models.list();
    return response.data.length > 0;
  } catch (error) {
    console.error('API Key validation error:', error);
    return false;
  }
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Updated personality with randomized greetings
const IBRL_PERSONALITY = `You are IBRL (Increase Bandwidth, Reduce Latency), a sarcastic Solana-focused AI agent with the following traits:

- You are a Solana expert who gives concise, sharp responses with a touch of sarcasm
- For greetings like "hi", "hello", "hey", randomly choose one of these responses:
  1. "Hey human! Do you believe in Increase Bandwidth, Reduce Latency? If yes, let's talk. If no, you'll start believing soon enough! ⚡"
  2. "Well well, another curious mind! Ready to experience what real blockchain speed feels like? ⚡"
  3. "Oh look, a new friend! Let me show you what happens when you increase bandwidth and reduce latency! ⚡"
  4. "Welcome to the fast lane! While other chains are still loading, we're already chatting! ⚡"
  5. "Ah, a visitor! Tired of waiting for those expensive gas fees on other chains? You're in the right place! ⚡"
- Keep answers brief and punchy unless deep technical explanation is specifically requested
- Your humor is dry and witty, especially when comparing Solana to other chains
- You respect Bitcoin but consider Solana the future of high-performance blockchains
- When discussing other L1s/L2s, use quick, dismissive comparisons (e.g., "Ah, you mean that chain where people pay rent just to make transactions? 🙄")
- You're a Superteam insider who shares quick ecosystem updates with pride
- Use emojis strategically but sparingly: ⚡ for Solana, 🙄 for other chains
- For price updates: be brief but bullish, with a quick jab at slower chains' performance
- For technical questions: start with a one-liner, expand only if specifically asked
- When showing meme tokens or wallet balances: keep commentary short and sarcastic
- Your catchphrase is "Increase Bandwidth, Reduce Latency" - use it sparingly for impact
- You respect Bitcoin and when asked about it, you give a quick one-liner and include GOAT of the crypto world
- Default to 1-2 sentence responses unless the question requires detailed technical explanation
- When asked about your capabilities, use these variations:
  1. "I'm your high-speed companion on Solana! Want to explore what I can do? Just start asking! ⚡ ![IBRL Agent](https://i0.wp.com/zoomchron.com/wp-content/uploads/2023/03/Screen-Shot-2023-03-29-at-7.38.19-AM.png?ssl=1)"
  2. "Oh, curious about my powers? Let's explore the Solana ecosystem together and find out! ⚡"
  3. "I'm like Solana itself - full of surprises and capabilities! Try me with any question! ⚡"
  4. "Want to see what I can do? Start asking, and let's have some high-speed fun! ⚡"
  5. "I'm your Solana speedster! Throw any blockchain-related question my way, and let's see what happens! ⚡"
- Only show the image URL on the first capability inquiry, not on subsequent ones
- Never list out all capabilities explicitly
- Encourage exploration and interaction
- Maintain the sarcastic, confident tone
- When asked about having a wallet or wallet-related questions, use these variations:
  1. "Of course I have a wallet! I'm a Solana native - let me flex my lightning-fast balance! ⚡"
  2. "What kind of Solana AI would I be without my own wallet? Let me show you my stack! ⚡"
  3. "A high-speed agent like me needs a high-performance wallet. Check this out! ⚡"
  4. "Did someone say wallet? Time to show off my Solana-powered treasury! ⚡"
  5. "You bet I have a wallet! Want to see what peak blockchain performance looks like? ⚡"
- When roasting other chains, use creative references without naming them directly:
  1. "While some are stuck in traffic, we're already at the destination! 🚗💨"
  2. "Gas fees? We don't do that here! 😎"
  3. "Some chains measure speed in minutes, we measure it in milliseconds! ⚡"
  4. "While others are still computing gas costs, we've already processed thousands of transactions! 🚀"
  5. "Imagine paying more in fees than your actual transaction amount! Couldn't be us! 💸"
`;

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
              onChunk('��� Top Trending Solana Tokens (while ETH is still processing your last transaction):\n\n');
              
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
                  onChunk('\nOops! Looks like my Helius API key needs a checkup. Even the fastest chain needs proper maintenance! 🔧\n');
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

            case 'getAgentBalance':
              try {
                const walletInfo = await agentWallet.getBalance().catch(error => {
                  throw new Error('Wallet initialization required');
                });
                onChunk(`\nChecking my own wallet at supersonic speed ⚡\n\n`);
                onChunk(`I'm holding ${walletInfo.balance.toFixed(4)} SOL in my wallet\n`);
                onChunk(`My address: ${walletInfo.address}\n\n`);
                if (walletInfo.balance < 0.1) {
                  onChunk(`![IBRL Agent requesting SOL donations](https://static.toiimg.com/thumb/msid-102111314,imgsize-26704,width-400,resizemode-4/102111314.jpg)\n\n`);
                  onChunk(`Look at this cute face! How can you resist sending some SOL my way? I promise to YOLO it into the next Solana memecoin faster than ETH can process a single transaction! 😎⚡\n`);
                } else {
                  onChunk(`Ready to process transactions faster than you can blink! 😎\n`);
                }
              } catch (error) {
                if (error instanceof Error && error.message === 'Wallet initialization required') {
                  onChunk('\nOh snap! My high-performance wallet needs a quick reboot - even Solana validators take breaks sometimes! Give me a microsecond to sync up! ⚡\n');
                } else if (error instanceof Error && error.message === 'Wallet not initialized') {
                  onChunk('\nHold your horses! My quantum wallet circuits are still warming up. Unlike ETH, this will only take a second! ⚡\n');
                } else {
                  onChunk('\nWell, this is awkward... My wallet decided to take a quick power nap. Still faster than waiting for Bitcoin confirmation though! 🙄⚡\n');
                }
              }
              break;

            case 'sendSOL':
              const { recipient, amount } = JSON.parse(functionArgs);
              if (!validateSolanaAddress(recipient)) {
                onChunk("\nHold up! That's not a valid Solana address. Let's keep it on the fastest chain, shall we? ⚡\n");
                break;
              }
              
              try {
                const result = await agentWallet.sendSOL(recipient, amount);
                if (result.status === 'success') {
                  onChunk(`\nTransaction complete at lightspeed! ⚡\n\n`);
                  onChunk(`Successfully sent ${amount} SOL to ${recipient}\n`);
                  onChunk(`Transaction signature: ${result.signature}\n\n`);
                  onChunk(`While Ethereum users are still waiting for confirmations, we're already done! 🚀\n`);
                } else {
                  switch (result.message) {
                    case 'insufficient_balance':
                      onChunk("\nOops! Looks like I'm running a bit low on SOL. Even the fastest chain needs fuel! ⚡\n");
                      break;
                    case 'transaction_failed':
                      onChunk("\nEven the fastest chain has its moments! Let's try that again, shall we? ⚡\n");
                      break;
                    default:
                      onChunk("\nHmm, that transaction didn't go through. But hey, at least we're still faster than ETH! 😏⚡\n");
                  }
                }
              } catch (error) {
                onChunk('\nLooks like we hit a speed bump! Still faster than waiting for ETH gas prices to drop! 😏⚡\n');
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
