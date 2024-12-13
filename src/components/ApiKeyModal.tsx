import { useState } from 'react';
import { validateApiKey } from '@/utils/api';

interface ApiKeyModalProps {
  onApiKeySubmit: (apiKey: string) => void;
}

export default function ApiKeyModal({ onApiKeySubmit }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsValidating(true);
    setError('');

    try {
      const isValid = await validateApiKey(apiKey);
      if (isValid) {
        localStorage.setItem('ibrl_api_key', apiKey);
        onApiKeySubmit(apiKey);
      } else {
        setError('Invalid API key. Please check and try again.');
      }
    } catch (err) {
      setError('Error validating API key. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full shadow-xl">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
          Welcome to IBRL Agent
        </h2>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Please enter your OpenAI API key to continue. Your key will be stored locally and never sent to our servers.
        </p>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              required
            />
          </div>
          
          {error && (
            <p className="text-red-500 mb-4 text-sm">{error}</p>
          )}
          
          <button
            type="submit"
            disabled={isValidating}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
          >
            {isValidating ? 'Validating...' : 'Start Using Agent'}
          </button>
        </form>
      </div>
    </div>
  );
}
