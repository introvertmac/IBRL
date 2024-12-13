import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { streamCompletion } from '@/utils/openai';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageUpdateTimeoutRef = useRef<NodeJS.Timeout>();

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (!isLoading) {
      const focusTimeout = setTimeout(() => {
        inputRef.current?.focus();
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
    <div className="flex flex-col h-screen">
      <div className="flex-0 border-b dark:border-gray-700 p-4">
        <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-white">
          IBRL Agent
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                  className="prose dark:prose-invert prose-sm max-w-none font-mono"
                  components={{
                    em: ({node, ...props}) => <em className="text-blue-400 not-italic tracking-wider" {...props} />,
                    strong: ({node, ...props}) => <strong className="text-blue-500 tracking-wider" {...props} />,
                    code: ({node, ...props}) => <code className="bg-gray-800 dark:bg-gray-700 rounded px-1 font-mono" {...props} />,
                    p: ({node, ...props}) => <p className="tracking-wide leading-relaxed" {...props} />
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              ) : (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex-0 p-4 border-t dark:border-gray-700">
        <div className="flex space-x-4">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 p-2 rounded-lg border dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            disabled={isLoading}
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
