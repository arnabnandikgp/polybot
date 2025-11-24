// Market Data from Gamma
export interface MarketInfo {
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
export interface AppConfig {
  RPC_URL_WSS: string;
  RPC_URL_HTTP?: string;
  PRIVATE_KEY: `0x${string}`;
  POLYMARKET_API_KEY: string;
  POLYMARKET_SECRET: string;
  POLYMARKET_PASSPHRASE: string;
  GAS_PRICE_MULTIPLIER?: number; // Default 1.1 (10% premium)
}

// Shared state for target markets
export type TargetMarket = MarketInfo;

