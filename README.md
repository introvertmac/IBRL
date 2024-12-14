# IBRL (Increase Bandwidth, Reduce Latency)

<div align="center">

A sophisticated Solana-focused AI agent with chat interface.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Solana](https://img.shields.io/badge/Solana-1.87-purple)](https://solana.com/)

</div>

## 🚀 Features

- **Real-time Solana Data**
  - Live price tracking and market analysis
  - Trending token insights
  - Wallet balance monitoring
  - Transaction analysis with detailed breakdowns

- **AI-Powered Interactions**
  - Natural language processing via GPT-4
  - Context-aware responses
  - Blockchain-specific knowledge integration
  - Sarcastic personality traits

- **Wallet Integration**
  - Built-in agent wallet functionality
  - Secure SOL transfers
  - Transaction validation
  - Balance management

- **Developer Experience**
  - TypeScript support
  - Hot reload development
  - Comprehensive API documentation
  - Rate limiting protection


## Prerequisites

Before you begin, ensure you have the following installed:
- Node.js 
- npm, yarn, pnpm, or bun

## Environment Setup

1. Create a `.env.local` file in the root directory
2. Add the following environment variables:
```bash
NEXT_PUBLIC_HELIUS_API_KEY=your_helius_api_key
NEXT_PUBLIC_WALLET_MNEMONIC=your_wallet_mnemonic
```

## Getting Started

1. Clone the repository:
```bash
git clone https://github.com/introvertmac/IBRL.git
cd IBRL
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

3. Run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   └── utils/
│       ├── wallet.ts
│       └── helius.ts
```



## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

