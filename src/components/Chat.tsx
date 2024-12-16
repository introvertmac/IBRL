import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import Image from 'next/image';
import { streamCompletion } from '@/utils/openai';
import { IconArrowRight, IconBolt, IconCoin, IconWallet, IconMicrophone } from './Icon';

// Add SpeechRecognition type
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

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

// Move ParagraphComponent declaration before MarkdownComponents
const ParagraphComponent = (props: any) => {
  const content = props.children?.toString() || '';
  const [copied, setCopied] = useState(false);
  
  // Check if content contains wallet address
  const addressMatch = content.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
  const isWalletAddress = addressMatch && content.includes('address');
  
  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isWalletAddress) {
    const address = addressMatch[0];
    return (
      <div className="space-y-1">
        <p className="font-mono text-sm text-gray-200">
          {content.split(address)[0]}
        </p>
        <button
          onClick={() => handleCopy(address)}
          className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg transition-colors duration-200 border border-gray-700"
        >
          <span className="font-mono text-sm break-all text-gray-200">{address}</span>
          {copied ? (
            <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
          )}
        </button>
      </div>
    );
  }

  // For transaction-related content
  const isTransaction = /signature|balance|SOL|transaction/i.test(content);
  return (
    <p className={`${
      isTransaction 
        ? 'font-mono text-sm break-all bg-gray-800 px-3 py-2 rounded-lg text-gray-200'
        : 'text-gray-200'
    }`}>
      {props.children}
    </p>
  );
};

// Update the ImageComponent to handle ReactMarkdown's prop types
const ImageComponent = (props: React.ComponentPropsWithoutRef<'img'>) => {
  return (
    <div className="my-4">
      <Image 
        src={props.src || ''} 
        alt={props.alt || ''}
        width={400} 
        height={400} 
        className="rounded-lg"
      />
    </div>
  );
};

// Then use it in MarkdownComponents
const MarkdownComponents = {
  p: (props: React.ComponentPropsWithoutRef<'p'>) => (
    <p className="mb-4">{props.children}</p>
  ),
  img: (props: React.ComponentPropsWithoutRef<'img'>) => (
    <div className="my-4">
      <Image 
        src={props.src || ''} 
        alt={props.alt || ''}
        width={400} 
        height={400} 
        className="rounded-lg"
      />
    </div>
  )
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageUpdateTimeoutRef = useRef<NodeJS.Timeout>();
  const [isListening, setIsListening] = useState(false);
  const recognition = useRef<any>(null);

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

  useEffect(() => {
    // Initialize speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognition.current = new SpeechRecognition();
      recognition.current.continuous = false;
      recognition.current.interimResults = false;
      recognition.current.lang = 'en-US';

      recognition.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
      };

      recognition.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognition.current?.stop();
    } else {
      recognition.current?.start();
      setIsListening(true);
    }
  };

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
                  className={`max-w-[85%] rounded-lg p-4 ${
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
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
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
            type="button"
            onClick={toggleListening}
            className={`absolute right-14 bottom-2 top-2 px-4 ${
              isListening ? 'text-red-500' : 'text-gray-500'
            } hover:text-gray-700 transition-colors duration-200`}
          >
            <IconMicrophone className="w-5 h-5" />
          </button>
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