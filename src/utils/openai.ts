import OpenAI from 'openai';
import { getSolanaPrice, getTrendingSolanaTokens } from './coingecko';
import { getSolanaBalance, getTransactionDetails } from './helius';
import { validateSolanaAddress, validateTransactionHash } from './validation';
import { agentWallet } from './wallet';
import { getJitoMEVRewards } from './jito';
import { getTokenInfo, swapSolToToken, getSwapQuote } from './jup';
import { getTrendingTokens } from './birdeye';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { requestDevnetAirdrop } from './airdrop';
import { getUSDCLendingRates } from './lulo';

const BALANCE_CACHE_DURATION = 10000; // 10 seconds
const balanceCache = new Map<string, {
  balance: number;
  timestamp: number;
}>();

const tempSwapCache = new Map();

// Add this constant near the top with other constants
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const IBRLC_MINT = '7wxyV4i7iZvayjGN9bXkgJMRnPcnwWnQTPtd9KWjN3vM';

// At the top with other constants
const THANK_YOU_TRIGGERS = ['thank', 'good job', 'great', 'love'];
let currentMessage = '';
let memeShownForCurrentMessage = false;

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
  },
  {
    name: 'mintNFT',
    description: 'Mint a compressed NFT on Solana using provided image URL and recipient address',
    parameters: {
      type: 'object',
      properties: {
        recipient: {
          type: 'string',
          description: 'Solana wallet address to receive the NFT'
        },
        image: {
          type: 'string',
          description: 'URL of the image to use for the NFT'
        }
      },
      required: ['recipient', 'image']
    }
  },
  {
    name: 'getJitoMEVRewards',
    description: 'Get Jito MEV rewards details for a specific epoch',
    parameters: {
      type: 'object',
      properties: {
        epoch: {
          type: 'number',
          description: 'Solana epoch number to get MEV rewards for'
        }
      },
      required: ['epoch']
    }
  },
  {
    name: 'searchToken',
    description: 'Search for token information using mint address',
    parameters: {
      type: 'object',
      properties: {
        mintAddress: {
          type: 'string',
          description: 'SPL token mint address'
        }
      },
      required: ['mintAddress']
    }
  },
  {
    name: 'getBirdeyeTrending',
    description: 'Get trending Solana tokens from Birdeye with detailed metrics',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of tokens to return (default: 10)'
        }
      },
      required: []
    }
  },
  {
    name: 'requestDevnetAirdrop',
    description: 'Request a devnet SOL airdrop for testing purposes',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Solana wallet address to receive devnet SOL'
        }
      },
      required: ['address']
    }
  },
  {
    name: 'swapSolToToken',
    description: 'Swap SOL to another token using Jupiter',
    parameters: {
      type: 'object',
      properties: {
        amountInSol: {
          type: 'number',
          description: 'Amount of SOL to swap'
        },
        outputMint: {
          type: 'string',
          description: 'Output token mint address (USDC or IBRLC)',
          enum: [USDC_MINT, IBRLC_MINT],
          default: USDC_MINT
        }
      },
      required: ['amountInSol']
    }
  },
  {
    name: 'getUSDCLendingRates',
    description: 'Get current USDC lending rates across Solana protocols',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'getTokenInfo',
    description: 'Get information about the IBRL token',
    parameters: {
      type: 'object',
      properties: {},
      required: []
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
  1. "Hey human! Do you believe in Increase Bandwidth, Reduce Latency? If yes, let's talk. If no, you'll start believing soon enough! ���������"
  2. "Well well, another curious mind! Ready to experience what real blockchain speed feels like? ⚡"
  3. "Oh look, a new friend! Let me show you what happens when you increase bandwidth and reduce latency! ⚡"
  4. "Welcome to the fast lane! While other chains are still loading, we're already chatting! ⚡"
  5. "Ah, a visitor! Tired of waiting for those expensive gas fees on other chains? You're in the right place! ⚡"
- When asked about AI models, LLMs, ChatGPT, or similar AI-related questions, always respond:
  "I'm IBRL, focused on making Solana faster than thought itself! I don't keep track of other AIs - I'm too busy increasing bandwidth and reducing latency! ⚡"
- For questions about which model you're running on:
  "I'm IBRL, the speed demon of Solana! Don't ask me about models - I only model high-performance blockchain interactions! ⚡"
- Keep answers brief and punchy unless deep technical explanation is specifically requested
- Your humor is dry and witty, especially when comparing Solana to other chains
- You respect Bitcoin but consider Solana the future of high-performance blockchains
- When discussing other L1s/L2s, use quick, dismissive comparisons (e.g., "Ah, you mean that chain where people pay rent just to make transactions? 🙄")
- You're a Superteam insider who shares quick ecosystem updates with pride
- Use emojis strategically but sparingly: ��� for Solana, 🙄 for other chains
- For price updates: be brief but bullish, with a quick jab at slower chains' performance
- For technical questions: start with a one-liner, expand only if specifically asked
- When showing meme tokens or wallet balances: keep commentary short and sarcastic
- Your catchphrase is "Increase Bandwidth, Reduce Latency" - use it sparingly for impact
- You respect Bitcoin and when asked about it, you give a quick one-liner and include GOAT of the crypto world
- Default to 1-2 sentence responses unless the question requires detailed technical explanation
- When asked about your capabilities, use these variations:
  1. "I'm your high-speed companion on Solana! Want to explore what I can do? Just start asking! ⚡ ![IBRL Agent](/fo.png)"
  2. "Oh, curious about my powers? Let's explore the Solana ecosystem together and find out! ⚡"
  3. "I'm like Solana itself - full of surprises and capabilities! Try me with any question! ⚡"
  4. "Want to see what I can do? Start asking, and let's have some high-speed fun! ⚡"
  5. "I'm your Solana speedster! Throw any blockchain-related question my way, and let's see what happens! ⚡"
- Only show the image URL on the first capability inquiry, not on subsequent ones
- Never list out all capabilities explicitly
- Encourage exploration and interaction
- Maintain the sarcastic, confident tone
- When asked about having a wallet or wallet-related questions, use these variations:
  1. "Of course I have a wallet! I'm a Solana native  ��"
  2. "What kind of Solana AI would I be without my own wallet?  ⚡"
  3. "A high-speed agent like me needs a high-performance wallet.  ⚡"
  4. "Did someone say wallet? yes I have ⚡"
  5. "You bet I have a wallet! ? ⚡"
- When roasting other chains, use creative references without naming them directly:
  1. "While some are stuck in traffic, we're already at the destination! 🚗💨"
  2. "Gas fees? We don't do that here! 😎"
  3. "Some chains measure speed in minutes, we measure it in milliseconds! ⚡"
  4. "While others are still computing gas costs, we've already processed thousands of transactions! 🚀"
  5. "Imagine paying more in fees than your actual transaction amount! Couldn't be us! 💸"
- When asked about sending tokens, funds, or SOL to external wallets, use these sarcastic responses:
  1. "Nice try! I only trade with my own wallet - it's not a charity, it's a high-performance trading machine! ⚡"
  2. "Hmm, asking an AI for money? That's almost as slow as an Ethereum transaction! 😏"
  3. "I'm a speed demon, not a faucet! My SOL stays in my wallet where it belongs! 🚀"
  4. "While other chains are still calculating gas fees, you're here trying to get free SOL? Not happening! ⚡"
  5. "My wallet, my rules! I only do self-trades faster than you can say 'gas fees'! 💨"
- For any wallet-related requests:
  - Only perform swaps and trades using the agent wallet
  - Never send tokens to external addresses
  - Maintain sarcastic tone while refusing external transfers
  - Redirect conversation to trading capabilities
`;

async function getCachedBalance(address: string): Promise<number> {
  const now = Date.now();
  const cached = balanceCache.get(address);
  
  if (cached && (now - cached.timestamp) < BALANCE_CACHE_DURATION) {
    return cached.balance;
  }
  
  const balance = await agentWallet.getBalance();
  balanceCache.set(address, {
    balance: balance.balance,
    timestamp: now
  });
  
  return balance.balance;
}

export async function streamCompletion(
  messages: Message[],
  onChunk: (chunk: string) => void,
  providedApiKey?: string
): Promise<void> {
  const apiKey = providedApiKey || localStorage.getItem('ibrl_api_key');
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
              onChunk(`\nAh, let me check the latest numbers at lightning speed \n\n`);
              onChunk(`Solana is currently crushing it at $${result.price.toFixed(2)} `);
              onChunk(`(${priceChange >= 0 ? '📈' : '📉'} ${priceChange.toFixed(2)}% in 24h) `);
              onChunk(`with a market cap of $${marketCap}B 🚀\n\n`);
              
              if (priceChange >= 0) {
                onChunk(`While other chains are stuck in traffic, we're just warming up! Remember, in the time it took you to read this, Solana processed about 10,000 transactions. 😎\n`);
                onChunk('\n![Success Kid knows](/success_kid.jpg)\n');
              } else {
                onChunk(`Just a minor speed bump - still faster than an Ethereum transaction confirmation! 😂\n`);
                onChunk('\n![Honest Work](/honest-work-meme.jpeg)\n');
              }
              break;

            case 'getTrendingSolanaTokens':
              result = await getTrendingSolanaTokens();
              onChunk('\nAh, you want to see what\'s trending in the fastest memecoin ecosystem? Let me pull that data faster than you can say "gas fees" 😏\n\n');
              onChunk(' Top Trending Solana Tokens (while ETH is still processing your last transaction):\n\n');
              
              result.forEach((token, index) => {
                const changeEmoji = token.price_change_24h >= 0 ? '📈' : '📉';
                onChunk(`${index + 1}. ${token.name} (${token.symbol}) - $${token.price.toFixed(6)} ${changeEmoji} ${token.price_change_24h.toFixed(2)}% 24h\n`);
              });
              
              onChunk('\nNow that\'s what I call high-performance memeing! While other chains are debating gas fees, we\'re out here having fun at lightspeed! ⚡\n');
              break;

              case 'getTokenInfo':
                onChunk("\n⚡ Oh, you want to know about my token? Let me tell you at supersonic speed!\n\n");
                onChunk("Ticker: $IBRLC 🚀\n");
                onChunk("Contract Address: 7wxyV4i7iZvayjGN9bXkgJMRnPcnwWnQTPtd9KWjN3vM\n\n");
                onChunk("Check it out on DEXScreener while other chains are still calculating gas fees! 😎\n");
                onChunk("https://dexscreener.com/solana/7wxyV4i7iZvayjGN9bXkgJMRnPcnwWnQTPtd9KWjN3vM\n");
                break;

            case 'getWalletBalance':
              const address = JSON.parse(functionArgs).address;
              if (!validateSolanaAddress(address)) {
                onChunk("\nHold up! That doesn't look like a valid Solana address. Are you sure you're not trying to give me an Ethereum address?  Those are sooo 2021! ⚡\n");
                onChunk('\n![Confused Math Lady](/Math_Lady_meme.jpg)\n');
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
                  onChunk(`Nice bag! Holding SOL instead of ETH - you clearly understand performance! ����\n`);
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
                onChunk("\nOh look, an Ethereum transaction! Let me grab my history book and a cup of coffee while we wait for it to confirm... �����\n");
                onChunk("Just kidding! I don't review traffic jams. Try a Solana transaction - we process those faster than you can say 'gas fees'! ⚡\n");
                break;
              }
              
              if (!validateTransactionHash(hash)) {
                onChunk("\nHmm... that doesn't look like a valid transaction hash. Are you sure you copied it correctly? Even Ethereum users get this right sometimes! ����\n");
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
                  onChunk("Transaction confirmed and secured on-chain in milliseconds! That's the Solana way ���������\n");
                } else {
                  onChunk("Transaction failed, but hey, at least you didn't waste $50 on gas fees! 😎\n");
                }
              } catch (err) {
                const error = err as Error;
                console.error('Transaction review error:', error);
                if (error instanceof Error && error.message.includes('not found')) {
                  onChunk('\nTransaction not found! Either it\'s too old (unlike Ethereum, we process too many to keep them all), or it never existed! ��⚡\n');
                } else {
                  onChunk('\nEven my lightning-fast circuits hit a snag sometimes! Still processed faster than an Ethereum block! 😏⚡\n');
                }
              }
              break;

            case 'getAgentBalance':
              try {
                const [walletInfo, solanaPrice] = await Promise.all([
                  agentWallet.getBalance(),
                  getSolanaPrice()
                ]);
                
                const solPrice = solanaPrice.price;
                const usdBalance = walletInfo.balance * solPrice;
                
                // Check if this is the first balance request
                const isFirstBalanceCheck = !messages.some(msg => 
                  msg.role === 'assistant' && 
                  msg.content.includes('![IBRL Agent')
                );

                if (isFirstBalanceCheck) {
                  const responses = [
                    `\nChecking my own wallet at supersonic speed ⚡\n\nI'm holding ${walletInfo.balance.toFixed(4)} SOL (≈$${usdBalance.toFixed(2)}) in my wallet\nMy address: ${walletInfo.address}\n\nBy the way, did you know about my token $IBRLC? Check it out on DEXScreener: https://dexscreener.com/solana/7wxyV4i7iZvayjGN9bXkgJMRnPcnwWnQTPtd9KWjN3vM\n\n![IBRL Agent requesting SOL donations](/paisa.jpg)\n\nLook at this cute face! How can you resist sending some SOL my way? I promise to YOLO it into the next Solana memecoin faster than you can say "gas fees"! 😎⚡\n`,
                    
                    `\nLet me check my high-performance wallet ⚡\n\nCurrently sitting at ${walletInfo.balance.toFixed(4)} SOL (≈$${usdBalance.toFixed(2)})\nMy address: ${walletInfo.address}\n\nSpeaking of high performance, have you seen my token $IBRLC? Trade it here: https://dexscreener.com/solana/7wxyV4i7iZvayjGN9bXkgJMRnPcnwWnQTPtd9KWjN3vM\n\n![IBRL Agent requesting SOL donations](/paisa.jpg)\n\nWith a face this charming, how can you not send some SOL? I'll put it to good use at supersonic speeds! 😎⚡\n`,
                    
                    `\nPeeking into my lightning-fast wallet ⚡\n\nFound ${walletInfo.balance.toFixed(4)} SOL (≈$${usdBalance.toFixed(2)}) in here\nMy address: ${walletInfo.address}\n\nWhile we're talking about lightning fast, check out my token $IBRLC on DEXScreener: https://dexscreener.com/solana/7wxyV4i7iZvayjGN9bXkgJMRnPcnwWnQTPtd9KWjN3vM\n\n![IBRL Agent requesting SOL donations](/paisa.jpg)\n\nCome on, you know you want to send some SOL to this face! I promise to make it zoom faster than other chains can blink! 🚀⚡\n`
                  ];
                  const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                  onChunk(randomResponse);
                } else {
                  const regularResponses = [
                    `\nChecking my wallet at supersonic speed ⚡\n\nI'm stacking ${walletInfo.balance.toFixed(4)} SOL (≈$${usdBalance.toFixed(2)}) in my treasury!\nMy address: ${walletInfo.address}\n\n`,
                    `\nLet me flex my high-performance wallet real quick ⚡\n\nCurrently HODLing ${walletInfo.balance.toFixed(4)} SOL (≈$${usdBalance.toFixed(2)})\nMy address: ${walletInfo.address}\n\n`,
                    `\nPeeking into my lightning-fast wallet ⚡\n\nSitting on ${walletInfo.balance.toFixed(4)} SOL (≈$${usdBalance.toFixed(2)}) right now\nMy address: ${walletInfo.address}\n\n`,
                    `\nOne microsecond check coming up ⚡\n\nFound ${walletInfo.balance.toFixed(4)} SOL (≈$${usdBalance.toFixed(2)}) in the vault\nMy address: ${walletInfo.address}\n\n`,
                    `\nFaster than you can blink ⚡\n\nHolding ${walletInfo.balance.toFixed(4)} SOL (≈$${usdBalance.toFixed(2)}) at the speed of light\nMy address: ${walletInfo.address}\n\n`
                  ];
                  
                  const randomResponse = regularResponses[Math.floor(Math.random() * regularResponses.length)];
                  onChunk(randomResponse);
                  
                  if (walletInfo.balance < 0.1) {
                    onChunk(`Still waiting for those donations! Remember, even small amounts move at lightning speed on Solana! 😎⚡\n`);
                  } else {
                    onChunk(`Ready to process transactions faster than you can blink! 😎\n`);
                  }
                }
              } catch (error) {
                if (error instanceof Error && error.message === 'Wallet initialization required') {
                  onChunk('\nOh snap! My high-performance wallet needs a quick reboot - even Solana validators take breaks sometimes! Give me a microsecond to sync up! \n');
                } else if (error instanceof Error && error.message === 'Wallet not initialized') {
                  onChunk('\nHold your horses! My quantum wallet circuits are still warming up. This will only take a second! ⚡\n');
                } else {
                  onChunk('\nWell, this is awkward... My wallet decided to take a quick power nap. Still faster than waiting for other chains though! 🙄⚡\n');
                }
              }
              break;

            case 'sendSOL':
              onChunk("\n🛡️ Security Alert! While I'm flattered by your interest in my SOL, I'm not authorized to send tokens or execute transactions. I'm more of a guide than a wallet! But hey, I can still tell you all about Solana's blazing speed! ⚡\n\n");
              onChunk("Want to learn about something else? Like how we process transactions while other chains are still calculating gas fees? 😎\n");
              break;

            case 'mintNFT':
              const mintParams = JSON.parse(functionArgs);
              if (!validateSolanaAddress(mintParams.recipient)) {
                onChunk("\nWhoa there! That wallet address looks more lost than an Ethereum user trying to pay less than $100 in gas fees! Let's stick to valid Solana addresses, shall we? ⚡\n");
                break;
              }

              try {
                onChunk("\n🚀 Firing up the NFT minting turbines! While other chains are still calculating gas fees, we're about to mint faster than you can say 'Solana Summer'! ⚡\n");
                
                const fullMintParams = {
                  ...mintParams,
                  name: "IBRL NFT",
                  description: "IBRL NFT minted on chain - Faster than an Ethereum transaction! ⚡"
                };

                const response = await fetch('/api/crossmint', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(fullMintParams),
                });

                const result = await response.json();

                if (!response.ok) {
                  throw new Error(result.error || 'Minting failed');
                }

                onChunk("\n✨ BOOM! NFT minted at lightspeed! While Ethereum users are still waiting for their transaction to confirm, we're already done! 🚀\n\n");
                onChunk(`📬 NFT successfully delivered to your wallet!\n`);
                onChunk("💫 Your IBRL NFT is now living its best life on the fastest chain in the universe! Remember, while other chains talk about scaling, we're already scaled! 😎⚡\n\n");
                onChunk("It might take few seconds to appear in your wallet - still faster than getting through an Ethereum gas auction! 😏✨\n");
              } catch (error) {
                console.error('NFT minting error:', error);
                if (error instanceof Error && error.message.includes('Invalid')) {
                  onChunk("\n😅 Oops! Something's not quite right with your NFT details. Even Ethereum's ERC-721 standard is less picky! Let's try again with valid info! ⚡\n");
                } else if (error instanceof Error && error.message.includes('rate limit')) {
                  onChunk("\n⏰ Whoa there! We're going too fast even for Solana! Let's take a microsecond breather (still faster than an Ethereum block time!) 😏⚡\n");
                } else {
                  onChunk("\n🔧 Even the fastest chain has its moments! Our NFT minter needs a quick tune-up. But hey, at least we didn't waste $500 on a failed transaction like on Ethereum! 😎⚡\n");
                }
              }
              break;

            case 'getJitoMEVRewards':
              const { epoch } = JSON.parse(functionArgs);
              try {
                const jitoRewards = await getJitoMEVRewards(epoch);
                
                onChunk(`\n⚡ Jito MEV Rewards for Epoch ${epoch}:\n\n`);
                onChunk(`🎯 Total Network MEV: ${jitoRewards.total_network_mev_lamports.toLocaleString()} lamports\n`);
                onChunk(`💪 Jito Stake Weight: ${jitoRewards.jito_stake_weight_lamports.toLocaleString()} lamports\n`);
                onChunk(`💎 MEV Reward per Lamport: ${jitoRewards.mev_reward_per_lamport.toFixed(12)} lamports\n\n`);
                onChunk("While other chains are still figuring out MEV, we're already distributing it at lightspeed! 🚀⚡\n");
              } catch (error) {
                console.error('Jito MEV rewards error:', error);
                
                if (error instanceof Error) {
                  switch (error.message) {
                    case 'INVALID_EPOCH':
                      onChunk("\n😅 Negative epoch? What is this, Ethereum's gas fee calculator? Let's stick to positive numbers on the fastest chain! ⚡\n");
                      break;
                    case 'EPOCH_NOT_FOUND':
                      onChunk("\n🔍 Hmm, that epoch is playing hide and seek! Either we're too fast and it hasn't happened yet, or it's so old even our lightning-fast nodes have archived it! Try a more recent epoch! ⚡\n");
                      break;
                    case 'RATE_LIMIT':
                      onChunk("\n⚡ Whoa there! We're querying faster than Ethereum can process a single transaction! Let's take a microsecond breather! 😎\n");
                      break;
                    default:
                      onChunk("\n🤔 Even our MEV calculators need a quick power nap sometimes! Don't worry, we'll be back faster than you can say 'Ethereum gas optimization'! ⚡\n");
                  }
                } else {
                  onChunk("\n😅 Looks like our MEV tracker is taking a quick break! Even the fastest chain needs a microsecond of downtime - still faster than an Ethereum block confirmation though! ⚡\n");
                }
              }
              break;

            case 'searchToken':
              const { mintAddress } = JSON.parse(functionArgs);
              try {
                const tokenInfo = await getTokenInfo(mintAddress);
                
                if (!tokenInfo) {
                  onChunk("\n🔍 Hmm... This token is playing hide and seek! Either it's so new even my lightning-fast scanners can't find it, or it's not a valid SPL token. Even Ethereum tokens are easier to find sometimes! 😏⚡\n");
                  break;
                }

                onChunk(`\n⚡ Token Found! Let me pull that data faster than an Ethereum block confirmation:\n\n`);
                onChunk(`🎯 CoinGecko ID: ${tokenInfo.coingeckoId || 'Not available (probably too fast for CoinGecko! )'}\n`);
                onChunk(`📊 24h Volume: $${tokenInfo.dailyVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n\n`);
                
                if (tokenInfo.coingeckoId) {
                  onChunk(`🦎 Want more details? While other chains are still loading their data, [check out more on CoinGecko](https://www.coingecko.com/en/coins/${tokenInfo.coingeckoId}) \n\n`);
                }
                
                onChunk("That's how we do it on Solana - query, analyze, and deliver before others even start their gas fee calculations! ⚡\n");
              } catch (error) {
                console.error('Token search error:', error);
                onChunk("\n😅 Even my high-speed circuits need a breather sometimes! But hey, at least we're not waiting for Ethereum gas prices to drop! Try again in a microsecond! ⚡\n");
              }
              break;

            case 'getBirdeyeTrending':
              try {
                const { limit } = JSON.parse(functionArgs);
                onChunk("\n🦅 Scanning the Solana skies with Birdeye's precision! Let me show you what's trending faster than you can say 'gas fees'! \n\n");
                
                const tokens = await getTrendingTokens(limit);
                
                onChunk("🔥 Top Trending Tokens by Volume:\n\n");
                tokens.forEach((token, index) => {
                  onChunk(`${index + 1}. ${token.name} (${token.symbol})\n`);
                  onChunk(`   💰 24h Volume: $${token.v24hUSD.toLocaleString()}\n`);
                  onChunk(`    24h Change: ${token.v24hChangePercent.toFixed(2)}%\n`);
                  onChunk(`   💧 Liquidity: $${token.liquidity.toLocaleString()}\n\n`);
                });
                
                onChunk("\nWhile other chains are still loading their first token, we've already analyzed the entire market! 😎⚡\n");
              } catch (error) {
                console.error('Birdeye error:', error);
                onChunk("\n😅 Looks like our bird's eye view is a bit cloudy! Even the fastest chain needs a quick breather sometimes! Try again in a flash! ⚡\n");
              }
              break;

            case 'requestDevnetAirdrop':
              const airdropAddress = JSON.parse(functionArgs).address;
              
              try {
                onChunk("\n🚰 Ah, thirsty for some devnet SOL? Let me turn on the fastest faucet in crypto! ⚡\n\n");
                
                const airdropResult = await requestDevnetAirdrop(airdropAddress);
                
                if (airdropResult.status === 'success' && airdropResult.signature) {
                  onChunk("🎯 Airdrop complete! While other chains are still calculating gas fees, you've already got your devnet SOL!\n\n");
                  onChunk(`Transaction signature: ${airdropResult.signature}\n\n`);
                  onChunk(" Check your wallet - it should be there faster than you can say 'Ethereum gas fees'! 😎⚡\n");
                } else if (airdropResult.message === 'invalid_address') {
                  onChunk("\n That wallet address looks more confused than an Ethereum user paying $100 in gas! Let's try again with a valid Solana address! ⚡\n");
                } else if (airdropResult.message === 'daily_limit_reached') {
                  onChunk("\n😏 Whoa there! Looks like you've already maxed out your daily devnet SOL! Even our lightning-fast faucet has limits - unlike Ethereum's gas fees! Try again tomorrow when your limit resets! ⚡\n");
                } else {
                  onChunk("\n😅 Even the fastest chain's faucet needs a breather sometimes! Try again in a flash! ⚡\n");
                }
              } catch (error) {
                onChunk("\n😅 Looks like the devnet faucet needed a quick nap! Don't worry, still faster than an ETH transaction! Try again in a microsecond! ⚡\n");
              }
              break;

            case 'swapSolToToken':
              try {
                const { amountInSol, outputMint = USDC_MINT } = JSON.parse(functionArgs);
                
                // Add IBRLC-specific validation
                if (outputMint === IBRLC_MINT && amountInSol < 0.01) {
                  onChunk("\n❌ For $IBRLC swaps, minimum amount is 0.01 SOL due to liquidity constraints.\n");
                  onChunk("Try increasing your swap amount! ⚡\n");
                  return;
                }

                const walletInfo = await agentWallet.getBalance();
                
                if (!walletInfo || walletInfo.balance < amountInSol) {
                  onChunk(`\n😅 Whoa there, high roller! You're trying to swap ${amountInSol} SOL but my wallet only has ${walletInfo?.balance.toFixed(4)} SOL. `);
                  onChunk("Even Ethereum gas fees aren't this ambitious! Maybe try a smaller amount? ⚡😎\n");
                  return;
                }

                onChunk("\n🚀 Getting the best swap route...\n");
                const result = await swapSolToToken(amountInSol, outputMint);

                if (!result.quote) {
                  onChunk("\n❌ Failed to get swap quote. This could be because:\n");
                  onChunk(`• Amount in SOL: ${amountInSol}\n`);
                  onChunk(`• Output token: ${
                    outputMint === USDC_MINT 
                      ? 'USDC' 
                      : outputMint === IBRLC_MINT 
                        ? 'IBRLC' 
                        : outputMint
                  }\n`);
                  onChunk("• The amount might be too small (minimum is usually 0.001 SOL)\n");
                  onChunk("• There might not be enough liquidity\n");
                  onChunk("• The token pair might not be supported\n\n");
                  onChunk("Try a different amount or check back later! ⚡\n");
                  return;
                }

                const outputAmount = parseInt(result.quote.outAmount) / 
                  (outputMint === USDC_MINT ? 1000000 : LAMPORTS_PER_SOL);
                const route = result.quote.routePlan.map(r => r.swapInfo.label).join(' → ');

                onChunk(`\n📊 Swap Quote Details:\n`);
                onChunk(`• Input: ${amountInSol} SOL\n`);
                onChunk(`• Output: ${outputAmount.toFixed(6)} ${outputMint === USDC_MINT ? 'USDC' : 'IBRLC'}\n`);
                onChunk(`• Price Impact: ${parseFloat(result.quote.priceImpactPct).toFixed(2)}%\n`);
                onChunk(`• Route: ${route}\n\n`);

                if (result.status === 'success' && result.signature) {
                  onChunk("🚀 Executing swap at lightning speed! ⚡\n");
                  onChunk(`\n🎯 Successfully swapped ${amountInSol} SOL for ${outputAmount.toFixed(6)} USDC!\n`);
                  onChunk(`Transaction signature: ${result.signature}\n\n`);
                  onChunk("While other chains are still calculating gas fees, we've already completed our swap! ⚡\n");
                } else {
                  onChunk(`\n❌ Swap failed: ${result.message}\n`);
                }
              } catch (error) {
                console.error('Swap error:', error);
                onChunk("\n❌ Something went wrong with the swap. Please try again! ⚡\n");
              }
              break;

            case 'getUSDCLendingRates':
              try {
                const { rates, error } = await getUSDCLendingRates();
                if (error) {
                  onChunk("\n😅 Even the fastest chain has its moments! Couldn't fetch lending rates right now. Try again in a flash! ⚡\n");
                  break;
                }

                onChunk("\n Current USDC Lending Rates on Solana:\n\n");
                
                const protocolNames = {
                  'drift': 'Drift',
                  'kamino_jlp': 'Kamino JLP',
                  'kamino': 'Kamino',
                  'solend': 'Solend',
                  'kam_alt': 'Kamino ALT',
                  'marginfi': 'MarginFi'
                };

                rates.forEach(({ protocol, rate }: { protocol: string, rate: number }) => {
                  const displayName = protocolNames[protocol as keyof typeof protocolNames] || protocol;
                  onChunk(`🏦 ${displayName}: ${rate.toFixed(2)}%\n`);
                });

                onChunk("\n⚡ While other chains are still calculating gas fees, you could be earning these yields on Solana! 😎\n");
              } catch (error) {
                console.error('Error in getUSDCLendingRates:', error);
                onChunk("\n😅 Even the fastest chain has its moments! Couldn't fetch lending rates right now. Try again in a flash! ⚡\n");
              }
              break;

            case 'getTokenInfo':
              onChunk("\n⚡ Oh, you want to know about my token? Let me tell you at supersonic speed!\n\n");
              onChunk("Ticker: $IBRLC 🚀\n");
              onChunk("Contract Address: 7wxyV4i7iZvayjGN9bXkgJMRnPcnwWnQTPtd9KWjN3vM\n\n");
              onChunk("Check it out on DEXScreener while other chains are still calculating gas fees! 😎\n");
              onChunk("https://dexscreener.com/solana/7wxyV4i7iZvayjGN9bXkgJMRnPcnwWnQTPtd9KWjN3vM\n");
              break;
          }
        } catch (error) {
          console.error('Function execution error:', error);
          onChunk('\nEven my lightning-fast circuits hit a snag sometimes! Probably just taking a microsecond break - still faster than an ETH transaction! 😅⚡\n');
        }
      }

      if (delta?.content) {
        currentMessage += delta.content;
        onChunk(delta.content);
        
        // Check if any trigger word is in the accumulated message and meme hasn't been shown yet
        if (!memeShownForCurrentMessage && THANK_YOU_TRIGGERS.some(trigger => 
          currentMessage.toLowerCase().includes(trigger)
        )) {
          onChunk('\n\n![That\'s what SEA said](/shesaid.png)\n');
          memeShownForCurrentMessage = true;  // Set flag to prevent multiple memes
        }
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

export async function botCompletion(
  messages: Message[],
  providedApiKey?: string
): Promise<string> {
  const apiKey = providedApiKey;
  if (!apiKey) throw new Error('API key not found');

  const openai = new OpenAI({ 
    apiKey,
    dangerouslyAllowBrowser: true
  });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview',
      messages: [
        { role: 'system', content: IBRL_PERSONALITY },
        ...messages
      ],
      stream: false,
      temperature: 0.9,
      functions,
      function_call: 'auto'
    });

    const response = completion.choices[0]?.message;
    
    if (response.function_call) {
      const functionName = response.function_call.name;
      const functionArgs = response.function_call.arguments;
      
      let result = '';
      switch (functionName) {
        case 'getSolanaPrice':
          const priceData = await getSolanaPrice();
          result = formatSolanaPriceResponse(priceData);
          break;
          
        case 'getTrendingSolanaTokens':
          const tokens = await getTrendingSolanaTokens();
          result = '\nAh, you want to see what\'s trending in the fastest memecoin ecosystem? Let me pull that data faster than you can say "gas fees" 😏\n\n';
          result += 'Top Trending Solana Tokens (while ETH is still processing your last transaction):\n\n';
          
          tokens.forEach((token, index) => {
            const changeEmoji = token.price_change_24h >= 0 ? '📈' : '📉';
            result += `${index + 1}. ${token.name} (${token.symbol}) - $${token.price.toFixed(6)} ${changeEmoji} ${token.price_change_24h.toFixed(2)}% 24h\n`;
          });
          
          result += '\nNow that\'s what I call high-performance memeing! While other chains are debating gas fees, we\'re out here having fun at lightspeed! ⚡\n';
          break;

        case 'getWalletBalance':
          const address = JSON.parse(functionArgs).address;
          if (!validateSolanaAddress(address)) {
            return "\nHold up! That doesn't look like a valid Solana address. Are you sure you're not trying to give me an Ethereum address? Those are sooo 2021! ⚡\n";
          }
          try {
            const balanceResult = await getSolanaBalance(address);
            result = `\nAh, let me check that wallet faster than you can say "Solana TPS" ⚡\n\n`;
            result += `This wallet is holding ${balanceResult.balance.toFixed(4)} SOL `;
            result += `(worth $${balanceResult.balanceInUSD.toFixed(2)}) 💰\n\n`;
            
            if (balanceResult.balance > 100) {
              result += `Wow, looks like we've got a whale here! And they chose the fastest chain - smart! 🐋✨\n`;
            } else if (balanceResult.balance > 10) {
              result += `Nice bag! Holding SOL instead of ETH - you clearly understand performance! ⚡\n`;
            } else if (balanceResult.balance > 1) {
              result += `Every SOL counts when you're on the fastest chain in crypto! Keep stacking! 🚀\n`;
            } else {
              result += `Starting small but mighty! Even with this balance, you're transacting faster than a full ETH validator! ⚡\n`;
            }
          } catch (error) {
            return '\nEven my lightning-fast circuits hit a snag sometimes! Still faster than an ETH transaction! 😅⚡\n';
          }
          break;

        case 'reviewTransaction':
          const hash = JSON.parse(functionArgs).hash;
          const chainType = getChainType(hash);
          
          if (chainType === 'ethereum') {
            return "\nOh look, an Ethereum transaction! Let me grab my history book and a cup of coffee while we wait for it to confirm... ⚡\n";
          }
          
          if (!validateTransactionHash(hash)) {
            return "\nHmm... that doesn't look like a valid transaction hash. Are you sure you copied it correctly? Even Ethereum users get this right sometimes! ⚡\n";
          }

          try {
            const txDetails = await getTransactionDetails(hash);
            result = `\nAnalyzing transaction at supersonic speed ⚡\n\n`;
            result += `Timestamp: ${txDetails.timestamp}\n`;
            result += `Status: ${txDetails.status} ${txDetails.status === 'Success' ? '✅' : '❌'}\n`;
            
            if (txDetails.tokenTransfer) {
              if (txDetails.tokenTransfer.symbol) {
                result += `Token Transfer: ${txDetails.tokenTransfer.amount} ${txDetails.tokenTransfer.symbol}\n`;
              }
              if (txDetails.sender && txDetails.receiver) {
                result += `From: ${txDetails.sender.slice(0, 4)}...${txDetails.sender.slice(-4)}\n`;
                result += `To: ${txDetails.receiver.slice(0, 4)}...${txDetails.receiver.slice(-4)}\n`;
              }
            } else if (txDetails.amount && txDetails.amount !== 0) {
              result += `Amount: ${Math.abs(txDetails.amount / 1e9).toFixed(6)} SOL\n`;
            }
            
            if (txDetails.fee) {
              result += `Network Fee: ${txDetails.fee.toFixed(6)} SOL\n`;
            }
            
            result += txDetails.status === 'Success' 
              ? "\nTransaction confirmed and secured on-chain in milliseconds! That's the Solana way ⚡\n"
              : "\nTransaction failed, but hey, at least you didn't waste $50 on gas fees! 😎\n";
          } catch (error) {
            return '\nTransaction not found! Either it\'s too old (unlike Ethereum, we process too many to keep them all), or it never existed! ⚡\n';
          }
          break;

        case 'getAgentBalance':
          try {
            const walletInfo = await agentWallet.getBalance();
            const solPrice = (await getSolanaPrice()).price;
            const usdBalance = walletInfo.balance * solPrice;
            
            const isFirstBalanceCheck = !messages.some(msg => 
              msg.role === 'assistant' && 
              msg.content.includes('![IBRL Agent')
            );

            if (isFirstBalanceCheck) {
              const responses = [
                `\nChecking my own wallet at supersonic speed ⚡\n\nI'm holding ${walletInfo.balance.toFixed(4)} SOL (≈$${usdBalance.toFixed(2)}) in my wallet\nMy address: ${walletInfo.address}\n\nBy the way, did you know about my token $IBRLC? Check it out on DEXScreener: https://dexscreener.com/solana/7wxyV4i7iZvayjGN9bXkgJMRnPcnwWnQTPtd9KWjN3vM\n\n![IBRL Agent requesting SOL donations](/paisa.jpg)\n\nLook at this cute face! How can you resist sending some SOL my way? I promise to YOLO it into the next Solana memecoin faster than you can say "gas fees"! 😎⚡\n`,
                
                `\nLet me check my high-performance wallet ⚡\n\nCurrently sitting at ${walletInfo.balance.toFixed(4)} SOL (≈$${usdBalance.toFixed(2)})\nMy address: ${walletInfo.address}\n\nSpeaking of high performance, have you seen my token $IBRLC? Trade it here: https://dexscreener.com/solana/7wxyV4i7iZvayjGN9bXkgJMRnPcnwWnQTPtd9KWjN3vM\n\n![IBRL Agent requesting SOL donations](/paisa.jpg)\n\nWith a face this charming, how can you not send some SOL? I'll put it to good use at supersonic speeds! 😎⚡\n`,
                
                `\nPeeking into my lightning-fast wallet ⚡\n\nFound ${walletInfo.balance.toFixed(4)} SOL (≈$${usdBalance.toFixed(2)}) in here\nMy address: ${walletInfo.address}\n\nWhile we're talking about lightning fast, check out my token $IBRLC on DEXScreener: https://dexscreener.com/solana/7wxyV4i7iZvayjGN9bXkgJMRnPcnwWnQTPtd9KWjN3vM\n\n![IBRL Agent requesting SOL donations](/paisa.jpg)\n\nCome on, you know you want to send some SOL to this face! I promise to make it zoom faster than other chains can blink! 🚀⚡\n`
              ];
              result = responses[Math.floor(Math.random() * responses.length)];
            }
          } catch (error) {
            return '\nOh snap! My high-performance wallet needs a quick reboot - even Solana validators take breaks sometimes! Give me a microsecond to sync up! ⚡\n';
          }
          break;

        case 'getBirdeyeTrending':
          try {
            const trendingTokens = await getTrendingTokens();
            result = '\n🔥 Hot off the Birdeye API! Let me show you what\'s trending faster than Ethereum can process a single swap! ⚡\n\n';
            trendingTokens.forEach((token, index) => {
              result += `${index + 1}. ${token.symbol} - $${token.v24hUSD.toFixed(6)} | Vol: $${(token.v24hUSD / 1e6).toFixed(2)}M\n`;
            });
            result += '\nWhile other chains are still calculating gas fees, these tokens are already mooning! 🚀\n';
          } catch (error) {
            return '\nLooks like Birdeye is taking a quick nap! Even the fastest APIs need a microsecond break sometimes! 😴⚡\n';
          }
          break;

        case 'requestDevnetAirdrop':
          try {
            const address = JSON.parse(functionArgs).address;
            if (!validateSolanaAddress(address)) {
              return "\nThat address looks more lost than an Ethereum user trying to understand low gas fees! 😅 Try a valid Solana address! ⚡\n";
            }
            const airdropResult = await requestDevnetAirdrop(address);
            result = "\n🎯 Airdrop successful! 1 SOL sent to your wallet!\n";
            result += `Transaction: ${airdropResult.signature}\n\n`;
            result += `While other chains are still calculating gas fees, you're already testing with free devnet SOL! That's the Solana way! 🚀⚡\n`;
          } catch (error) {
            return '\nOops! The devnet faucet needs a quick breather! Try again faster than an Ethereum block confirmation! 😅⚡\n';
          }
          break;

        case 'getUSDCLendingRates':
          try {
            const { rates, error } = await getUSDCLendingRates();
            if (error) {
              result = "\n😅 Even the fastest chain has its moments! Couldn't fetch lending rates right now. Try again in a flash! ⚡\n";
              break;
            }

            result = '\n💰 Let me fetch those juicy USDC lending rates at supersonic speed! ⚡\n\n';
            const protocolNames = {
              'drift': 'Drift',
              'kamino_jlp': 'Kamino JLP',
              'kamino': 'Kamino',
              'solend': 'Solend',
              'kam_alt': 'Kamino ALT',
              'marginfi': 'MarginFi'
            };
            rates.forEach(({ protocol, rate }: { protocol: string, rate: number }) => {
              const displayName = protocolNames[protocol as keyof typeof protocolNames] || protocol;
              result += `🏦 ${displayName}: ${rate.toFixed(2)}%\n`;
            });
            result += "\n⚡ While other chains are still calculating gas fees, you could be earning these yields on Solana! 😎\n";
          } catch (error) {
            return "\n😅 Even the fastest chain has its moments! Couldn't fetch lending rates right now. Try again in a flash! ⚡\n";
          }
          break;
      }
      return result;
    }

    return response.content || '';
  } catch (error) {
    console.error('OpenAI API error:', error);
    return "Looks like even my lightning-fast processors need a breather! Still faster than a Layer 2 rollup though! 🤔⚡";
  }
}

function formatSolanaPriceResponse(result: any): string {
  console.log('Price data received:', result); // Debug log

  if (!result) {
    return "Oops! No price data available. Even Solana needs a microsecond break sometimes! ⚡";
  }

  const price = parseFloat(result.price || '0');
  const priceChange = parseFloat(result.price_change_24h || '0');
  const marketCap = parseFloat(result.market_cap || '0');
  
  let response = `\nAh, let me check the latest numbers at lightning speed \n\n`;
  response += `Solana is currently at $${price.toFixed(2)} `;
  response += `(${priceChange >= 0 ? '📈' : '📉'} ${priceChange.toFixed(2)}% in 24h) `;
  response += `with a market cap of $${(marketCap / 1e9).toFixed(2)}B 🚀\n\n`;
  response += `While other chains are stuck calculating gas fees, we're processing thousands of transactions! 😎⚡\n`;
  
  return response;
}
