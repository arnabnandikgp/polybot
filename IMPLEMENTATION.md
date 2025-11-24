Polymarket Post-Resolution Arbitrage Bot - Implementation Spec
1. Project Overview
We are building a high-frequency arbitrage bot for Polymarket.
The Strategy: "Settlement Latency Arbitrage."
Identify markets where the UMA Oracle challenge period is about to expire.
Buy "Winning" outcome shares at a discount (e.g., $0.99) via the CLOB (Central Limit Order Book) API just before or immediately after the timer hits zero.
Monitor the UMA Oracle contract via a high-speed RPC.
Instantly force the market resolution on-chain (resolve()) and claim winnings (redeemPositions()) in the same flow to recycle capital.
2. Tech Stack & Constraints
Language: TypeScript (Node.js LTS).
Blockchain Client: viem (Must use for performance/lightweight over ethers.js).
Polymarket SDK: @polymarket/clob-client (For order execution).
HTTP/WSS: axios (REST), ws (WebSockets).
Logging: pino (Structured, low-overhead logging).
Environment: dotenv for secret management.
Infrastructure: Assumed running in AWS us-east-1 with Alchemy/Infura WebSocket RPC.
3. Architecture Modules
The system consists of three decoupled modules running concurrently:
The Scout: Polls Gamma API to find markets nearing expiration.
The Sniper: Listens to CLOB prices and executes Buy orders.
The Settler: Monitors Polygon Mainnet blocks to Force Resolve and Redeem.
4. Module Specifications
A. The Scout (Market Discovery)
Source: https://gamma-api.polymarket.com/markets
Logic:
Fetch markets where active = true.
Filter for markets where uma_end_date (or expiration) is within the next 15 minutes.
Must retrieve condition_id, question_id, tokens (outcomes), and slug.
Output: Updates a shared TargetMarket[] in-memory state.
B. The Sniper (CLOB Execution)
Authentication: Must implement L2 Headers (EIP-712 signing) using @polymarket/clob-client.
Action:
For every market in TargetMarket[], fetch or subscribe to the Order Book.
Trigger Condition: IF BestAskPrice < 1.00 (Target: $0.99) AND Outcome == Winner.
Execution: Send FOK (Fill-Or-Kill) Limit Order.
Error Handling: Handle INSUFFICIENT_BALANCE gracefully (stop buying).
C. The Settler (Blockchain Interaction - Critical)
This module bypasses the Polymarket UI to interact directly with smart contracts.
Required Contracts (Polygon Mainnet):
UMA Oracle: 0xee3af10ebb505d975377d620ccfc098e9168858a (Verifying Contract)
UMA CTF Adapter: 0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296 (Bridge)
ConditionalTokens (CTF): 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045 (Vault)
USDC.e: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 (Collateral)
Logic Loop (On New Block):
Check UMA Oracle for the questionID.
Get requestTimestamp (when it was proposed) and liveness (usually 7200 seconds).
Calculation: expiration = requestTimestamp + liveness.
Action 1 (Resolve):
IF block.timestamp > expiration AND state != Resolved:
Call UmaCtfAdapter.resolve(questionID).
Action 2 (Redeem):
IF state == Resolved:
Call ConditionalTokens.redeemPositions(...).
Params: collateralToken (USDC), parentCollectionId (bytes32(0)), conditionId, indexSets ([1, 2]).
5. Data Structures (TypeScript Interfaces)
Use these interfaces to ensure type safety.
code
TypeScript
// Market Data from Gamma
interface MarketInfo {
  id: string;
  questionID: string;
  conditionID: string;
  slug: string;
  expirationTimestamp: number; // UMA Liveness expiry
  tokens: {
    outcome: "Yes" | "No";
    tokenID: string;
    winner: boolean; // Inferred or manually set
  }[];
}

// Config Layout
interface AppConfig {
  RPC_URL_WSS: string;
  PRIVATE_KEY: `0x${string}`;
  POLYMARKET_API_KEY: string;
  POLYMARKET_SECRET: string;
  POLYMARKET_PASSPHRASE: string;
}
6. Detailed Implementation Steps (For Cursor)
Step 1: Setup & Config
Initialize a new TS project.
Install dependencies: viem, @polymarket/clob-client, dotenv, pino.
Create a config.ts to load env vars.
Step 2: ABI Management
Create an abis/ folder.
We need minimal ABIs (Interfaces) for:
UMA Oracle: Function getRequest (to check timestamps).
UMA Adapter: Function resolve.
CTF: Function redeemPositions.
Note to Cursor: Use viem's parseAbi to define these inline if full JSONs are not available.
Step 3: The Settler (Build First)
Create src/settler.ts.
Initialize viem WalletClient and PublicClient.
Write a function checkMarketStatus(questionID) that reads from UMA.
Write a function executeRedemption(conditionID, indexSets) that submits the tx.
Step 4: The Scout & Sniper
Create src/scout.ts to fetch from Gamma API.
Create src/sniper.ts using ClobClient.
Implement buyAtLimit(tokenID, price) using the SDK.
Step 5: Main Loop (index.ts)
Orchestrate the 3 modules.
Start the Scout polling (Interval: 60s).
Start the Settler block listener (WSS).
7. Critical Logic Checks
Gas Management: Transactions must be high priority. Use viem to fetch current gas price and add a 10-20% premium.
Concurrency: The resolve and redeem functions might be called by other bots. Handle execution reverted errors gracefully (it means someone beat us to it, which is fine, we just move to redeem).
Decimals: Polymarket API uses Strings for prices ("0.99"). Smart Contracts use BigInt (USDC has 6 decimals). ensure conversion is correct.
