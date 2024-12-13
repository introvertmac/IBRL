'use client';

import { useState, useEffect } from 'react';
import ApiKeyModal from '@/components/ApiKeyModal';
import Chat from '@/components/Chat';

export default function Home() {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    const apiKey = localStorage.getItem('ibrl_api_key');
    setHasApiKey(!!apiKey);
  }, []);

  const handleApiKeySubmit = (apiKey: string) => {
    setHasApiKey(true);
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
