'use client';

import { useState, useEffect } from 'react';
import ApiKeyModal from '@/components/ApiKeyModal';
import Chat from '@/components/Chat';
import { validateApiKey } from '@/utils/openai';

export default function Home() {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    const apiKey = localStorage.getItem('ibrl_api_key');
    setHasApiKey(!!apiKey);
  }, []);

  const handleApiKeySubmit = async (apiKey: string) => {
    const isValid = await validateApiKey(apiKey);
    if (isValid) {
      setHasApiKey(true);
    }
  };

  if (hasApiKey === null) {
    return null;
  }

  return (
    <main className="h-screen bg-gray-50 dark:bg-gray-900">
      {!hasApiKey && <ApiKeyModal onApiKeySubmit={handleApiKeySubmit} />}
      <Chat />
    </main>
  );
}
