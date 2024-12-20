import TelegramBot from 'node-telegram-bot-api';
import { botCompletion } from '../utils/openai';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function handleMessage(
  messages: Message[],
  chatId: number,
  bot: TelegramBot
): Promise<string> {
  try {
    await bot.sendChatAction(chatId, 'typing');
    
    const response = await botCompletion(messages, process.env.OPENAI_API_KEY);
    
    await bot.sendMessage(chatId, response, {
      parse_mode: 'Markdown'
    });

    return response;
  } catch (error) {
    console.error('Error in handleMessage:', error);
    throw error;
  }
}
