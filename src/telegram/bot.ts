import TelegramBot from 'node-telegram-bot-api';
import { handleMessage } from './handler';

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set in environment variables');
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set in environment variables');
}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Store ongoing conversations
const conversations = new Map<number, Array<{ role: 'user' | 'assistant' | 'system', content: string }>>();

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  
  // Initialize conversation if it doesn't exist
  if (!conversations.has(chatId)) {
    conversations.set(chatId, []);
  }

  try {
    // Add user message to conversation history
    const userMessage: Message = { role: 'user', content: msg.text || '' };
    const currentConversation = conversations.get(chatId)!;
    currentConversation.push(userMessage);

    // Maintain conversation history (last 10 messages)
    if (currentConversation.length > 10) {
      currentConversation.splice(0, currentConversation.length - 10);
    }

    // Handle the message and get response
    const response = await handleMessage(currentConversation, chatId, bot);
    
    // Add assistant response to conversation history
    if (response) {
      currentConversation.push({ role: 'assistant', content: response });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    bot.sendMessage(chatId, "Even my lightning-fast circuits hit a snag sometimes! Still faster than an ETH transaction! 😅⚡");
  }
});

process.on('SIGINT', () => {
  bot.stopPolling();
  process.exit();
});

export { bot };
