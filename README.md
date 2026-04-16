# Liquity v2 Savings Calculator

Connect your wallet and see how much you could save by migrating your borrow positions to Liquity v2.

## Quick start

```bash
# 1. Install Node.js (v18+)
#    https://nodejs.org or via nvm: nvm install 20

# 2. Install dependencies
npm install

# 3. Configure env vars
cp .env.local.example .env.local
# Edit .env.local — add your WalletConnect project ID and RPC URL

# 4. Run dev server
npm run dev
# → http://localhost:3000
```

## Required env vars

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | https://cloud.walletconnect.com |
| `NEXT_PUBLIC_RPC_URL` | https://alchemy.com or https://infura.io |

Both free tiers work fine.

## What it does

1. Connects wallet via ConnectKit (MetaMask, Coinbase, WalletConnect, etc.)
2. Scans **Aave v3**, **Morpho Blue**, **Maker MCD**, **Compound v3**, and **Sky/USDS** for open borrow positions
3. Fetches live Liquity v2 interest rate distributions (avg, p25, p10) per collateral branch (WETH, wstETH, rETH)
4. Computes annual savings: `debtUSD × (currentAPR − liquityV2Rate)`
5. Shows a summary card + detailed table with a "Migrate ↗" link per position

## Stack

- Next.js 14 (App Router)
- wagmi v2 + viem + ConnectKit
- Tailwind CSS
- TypeScript

## Data sources

- **Aave v3**: `UiPoolDataProvider` contract (on-chain)
- **Morpho Blue**: The Graph subgraph
- **Maker MCD**: The Graph subgraph + `Jug` contract for live rates
- **Compound v3**: `Comet` contracts directly (on-chain)
- **Liquity v2**: The Graph subgraph → on-chain fallback → hardcoded fallback
- **Prices**: CoinGecko free API
