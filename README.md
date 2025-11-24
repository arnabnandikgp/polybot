# Polymarket Post-Resolution Arbitrage Bot

A high-frequency arbitrage bot for Polymarket that exploits settlement latency by buying winning outcome shares at a discount and immediately redeeming them after market resolution.

## Strategy Overview

**Settlement Latency Arbitrage:**
1. Identify markets where the UMA Oracle challenge period is about to expire
2. Buy "Winning" outcome shares at a discount (e.g., $0.99) via the CLOB API
3. Monitor the UMA Oracle contract via high-speed RPC
4. Force market resolution on-chain (`resolve()`) and claim winnings (`redeemPositions()`) in the same flow

## Architecture

The bot consists of three decoupled modules running concurrently:

- **Scout**: Polls Gamma API to find markets nearing expiration (15-minute window)
- **Sniper**: Listens to CLOB prices and executes Buy orders when conditions are met
- **Settler**: Monitors Polygon Mainnet blocks to Force Resolve and Redeem positions

## Setup

### Prerequisites

- Node.js LTS version
- Polygon Mainnet RPC endpoint (WebSocket recommended, e.g., Alchemy/Infura)
- Polymarket CLOB API credentials
- Private key for wallet with USDC balance

### Installation

```bash
npm install
```

### Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Fill in your environment variables in `.env`:
```env
# WebSocket RPC URL for Polygon Mainnet (required)
RPC_URL_WSS=wss://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# HTTP RPC URL for Polygon Mainnet (optional)
RPC_URL_HTTP=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Private key for wallet (must start with 0x)
PRIVATE_KEY=0x...

# Polymarket CLOB API credentials
POLYMARKET_API_KEY=your_api_key
POLYMARKET_SECRET=your_secret
POLYMARKET_PASSPHRASE=your_passphrase

# Gas price multiplier (optional, default: 1.1 for 10% premium)
GAS_PRICE_MULTIPLIER=1.1
```

### Building

```bash
npm run build
```

### Running

```bash
npm start
```

Or for development (rebuilds before running):
```bash
npm run dev
```

## Contract Addresses (Polygon Mainnet)

- **UMA Oracle**: `0xee3af10ebb505d975377d620ccfc098e9168858a`
- **UMA CTF Adapter**: `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296`
- **ConditionalTokens (CTF)**: `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`
- **USDC.e Collateral**: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`

## Important Notes

1. **Winner Detection**: The `determineWinner()` function in `sniper.ts` is currently a placeholder. You need to implement logic to determine which outcome is the winner based on market resolution.

2. **Gas Management**: Transactions use a configurable gas price multiplier (default 10% premium) to ensure timely execution.

3. **Error Handling**: The bot handles common errors gracefully:
   - `MARKET_ALREADY_RESOLVED`: Market was resolved by another bot (proceeds to redemption)
   - `REDEMPTION_FAILED`: Positions may already be redeemed
   - `INSUFFICIENT_BALANCE`: Stops buying when balance is low

4. **Concurrency**: Multiple bots may compete for the same opportunities. The bot handles execution reverted errors gracefully.

## Development

### Project Structure

```
src/
├── index.ts          # Main orchestration file
├── config.ts         # Configuration loader
├── types.ts          # TypeScript interfaces
├── scout.ts          # Market discovery module
├── sniper.ts         # CLOB execution module
├── settler.ts        # Blockchain interaction module
└── abis/             # Minimal contract ABIs
    ├── umaOracle.ts
    ├── umaCtfAdapter.ts
    └── conditionalTokens.ts
```

## License

ISC

