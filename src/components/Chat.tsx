import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import Image from 'next/image';
import { streamCompletion } from '@/utils/openai';
import { IconArrowRight, IconBolt, IconCoin, IconWallet } from './Icon';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const EXAMPLE_PROMPTS = [
  {
    title: "Check SOL Price",
    prompt: "What's the current Solana price?",
    icon: <IconBolt className="w-6 h-6" />
  },
  {
    title: "View Trending Tokens",
    prompt: "Show me trending Solana tokens",
    icon: <IconCoin className="w-6 h-6" />
  },
  {
    title: "Ask me about Superteam",
    prompt: "Tell me about Superteam",
    icon: <IconWallet className="w-6 h-6" />
  }
];

// Custom renderer for markdown images using Next.js Image
const MarkdownComponents = {
  img: (props: any) => {
    return (
      <div className="relative w-full h-64 my-4">
        <Image
          src={props.src}
          alt={props.alt || "IBRL Agent Image"}
          fill
          style={{ objectFit: 'contain' }}
          priority
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
      </div>
    );
  },
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageUpdateTimeoutRef = useRef<NodeJS.Timeout>();

  const isInitialState = messages.length === 0;

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (!isLoading) {
      const focusTimeout = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(focusTimeout);
    }
  }, [isLoading]);

  useEffect(() => {
    if (messageUpdateTimeoutRef.current) {
      clearTimeout(messageUpdateTimeoutRef.current);
    }
    messageUpdateTimeoutRef.current = setTimeout(scrollToBottom, 100);
    
    return () => {
      if (messageUpdateTimeoutRef.current) {
        clearTimeout(messageUpdateTimeoutRef.current);
      }
    };
  }, [messages, scrollToBottom]);

  const updateMessages = useCallback((currentContent: string) => {
    setMessages(prev => {
      const newMessages = [...prev];
      const lastMessage = newMessages[newMessages.length - 1];
      
      if (lastMessage?.role === 'assistant') {
        return [
          ...newMessages.slice(0, -1),
          { ...lastMessage, content: currentContent }
        ];
      }
      return [...newMessages, { role: 'assistant', content: currentContent }];
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input.trim() } as Message;
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      let currentContent = '';
      const allMessages = [...messages, userMessage];
      
      await streamCompletion(allMessages, (chunk) => {
        currentContent += chunk;
        updateMessages(currentContent);
      });
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'I apologize, but I encountered an error. Please try again.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex-0 border-b dark:border-gray-800 p-4">
        <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-white font-mono">
          IBRL Agent
        </h1>
      </div>

      <div className={`flex-1 ${isInitialState ? 'flex items-center justify-center' : 'overflow-y-auto'} p-4`}>
        {isInitialState ? (
          <div className="w-full max-w-2xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-8 text-gray-800 dark:text-gray-200">
              The Fastest AI in the West ⚡
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {EXAMPLE_PROMPTS.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setInput(prompt.prompt);
                    textareaRef.current?.focus();
                  }}
                  className="flex items-center p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-200 dark:border-gray-700"
                >
                  <div className="mr-3 text-blue-500">{prompt.icon}</div>
                  <div className="text-left">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{prompt.title}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{prompt.prompt}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-3xl mx-auto space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-4 ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white user-message'
                      : 'bg-white dark:bg-gray-800 dark:text-white shadow-md assistant-message'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <ReactMarkdown 
                      components={MarkdownComponents}
                      className="prose dark:prose-invert max-w-none"
                    >
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex-0 p-4 border-t dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        <form 
          onSubmit={handleSubmit}
          className="w-full max-w-3xl mx-auto relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Type your message..."
            className="w-full p-4 pr-24 bg-transparent resize-none outline-none dark:text-white font-mono"
            rows={1}
            style={{ maxHeight: '200px' }}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-2 bottom-2 top-2 px-4 bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors duration-200"
          >
            <IconArrowRight className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
