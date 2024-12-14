import { useState } from 'react';
import { validateApiKey } from '@/utils/openai';

interface ApiKeyModalProps {
  onApiKeySubmit: (apiKey: string) => void;
}

export default function ApiKeyModal({ onApiKeySubmit }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsValidating(true);

    try {
      const isValid = await validateApiKey(apiKey.trim());
      
      if (isValid) {
        localStorage.setItem('ibrl_api_key', apiKey.trim());
        onApiKeySubmit(apiKey.trim());
      } else {
        setError('Invalid OpenAI API key. Please check and try again.');
      }
    } catch (error) {
      setError('Error validating API key. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl transform transition-all duration-300 scale-100">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center">
            Enter Your OpenAI API Key
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mt-2 text-center text-sm">
            Your key will be stored locally and never shared
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full p-4 border-2 rounded-xl mb-2 bg-transparent dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200 outline-none font-mono"
              required
            />
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
          </div>
          
          {error && (
            <div className="flex items-center space-x-2 text-red-500 text-sm bg-red-50 dark:bg-red-900/30 p-3 rounded-lg">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}
          
          <button
            type="submit"
            disabled={isValidating || !apiKey.trim()}
            className="w-full bg-blue-500 text-white rounded-xl p-4 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] font-medium"
          >
            {isValidating ? (
              <div className="flex items-center justify-center space-x-2">
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Validating...</span>
              </div>
            ) : (
              'Connect to OpenAI'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
