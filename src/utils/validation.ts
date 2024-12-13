export const validateSolanaAddress = (address: string): boolean => {
  // Basic Solana address validation (base58 check, 32-44 characters)
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};

export const validateTransactionHash = (hash: string): boolean => {
  // Basic Solana transaction signature validation
  return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(hash);
};

export const getChainType = (address: string): 'solana' | 'ethereum' | 'invalid' => {
  if (address.startsWith('0x')) return 'ethereum';
  if (validateSolanaAddress(address)) return 'solana';
  return 'invalid';
};
