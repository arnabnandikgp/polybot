import { createPublicClient, createWalletClient, http, webSocket, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import pino from "pino";
import type { AppConfig } from "./types.js";
import { umaOracleAbi } from "./abis/umaOracle.js";
import { umaCtfAdapterAbi } from "./abis/umaCtfAdapter.js";
import { conditionalTokensAbi } from "./abis/conditionalTokens.js";

const logger = pino({ level: "info" });

// Contract addresses on Polygon Mainnet
const UMA_ORACLE_ADDRESS = "0xee3af10ebb505d975377d620ccfc098e9168858a" as Address;
const UMA_CTF_ADAPTER_ADDRESS = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296" as Address;
const CONDITIONAL_TOKENS_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" as Address;
const USDC_COLLATERAL_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as Address;

export class Settler {
  private publicClient;
  private walletClient;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;

    // Initialize account from private key
    const account = privateKeyToAccount(config.PRIVATE_KEY);

    // Initialize public client (read-only)
    this.publicClient = createPublicClient({
      chain: polygon,
      transport: webSocket(config.RPC_URL_WSS),
    });

    // Initialize wallet client (for transactions)
    const httpTransport = config.RPC_URL_HTTP
      ? http(config.RPC_URL_HTTP)
      : http();
    
    this.walletClient = createWalletClient({
      chain: polygon,
      transport: httpTransport,
      account,
    });

    logger.info("Settler initialized");
  }

  /**
   * Check market status by reading from UMA Oracle
   * Returns expiration timestamp and current state
   */
  async checkMarketStatus(questionID: `0x${string}`): Promise<{
    expirationTimestamp: bigint;
    isExpired: boolean;
    isResolved: boolean;
  }> {
    try {
      // Read from UMA Oracle
      const [requestTimestamp, liveness] = await this.publicClient.readContract({
        address: UMA_ORACLE_ADDRESS,
        abi: umaOracleAbi,
        functionName: "getRequest",
        args: [questionID],
      });

      const expirationTimestamp = requestTimestamp + liveness;
      const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
      const isExpired = currentTimestamp > expirationTimestamp;

      // Check if market is resolved (we'll need to check the CTF contract state)
      // For now, we'll assume it's not resolved if we can still call resolve
      const isResolved = false; // TODO: Check actual resolved state from CTF

      return {
        expirationTimestamp,
        isExpired,
        isResolved,
      };
    } catch (error) {
      logger.error({ questionID, error }, "Error checking market status");
      throw error;
    }
  }

  /**
   * Force resolve a market by calling UmaCtfAdapter.resolve()
   */
  async resolveMarket(questionID: `0x${string}`): Promise<string> {
    try {
      logger.info({ questionID }, "Attempting to resolve market");

      // Get current gas price and add premium
      const gasPrice = await this.publicClient.getGasPrice();
      const premiumGasPrice = (gasPrice * BigInt(Math.floor(this.config.GAS_PRICE_MULTIPLIER! * 100))) / 100n;

      const hash = await this.walletClient.writeContract({
        address: UMA_CTF_ADAPTER_ADDRESS,
        abi: umaCtfAdapterAbi,
        functionName: "resolve",
        args: [questionID],
        gasPrice: premiumGasPrice,
      });

      logger.info({ questionID, hash }, "Market resolution transaction submitted");
      
      // Wait for transaction receipt
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === "success") {
        logger.info({ questionID, hash }, "Market resolved successfully");
      } else {
        logger.error({ questionID, hash }, "Market resolution transaction failed");
      }

      return hash;
    } catch (error: any) {
      // Handle execution reverted errors gracefully (someone beat us to it)
      if (error.message?.includes("execution reverted") || error.message?.includes("revert")) {
        logger.warn({ questionID, error: error.message }, "Market already resolved or resolution failed");
        throw new Error("MARKET_ALREADY_RESOLVED");
      }
      logger.error({ questionID, error }, "Error resolving market");
      throw error;
    }
  }

  /**
   * Redeem positions from ConditionalTokens contract
   */
  async redeemPositions(
    conditionID: `0x${string}`,
    indexSets: bigint[] = [1n, 2n]
  ): Promise<string> {
    try {
      logger.info({ conditionID, indexSets }, "Attempting to redeem positions");

      // Get current gas price and add premium
      const gasPrice = await this.publicClient.getGasPrice();
      const premiumGasPrice = (gasPrice * BigInt(Math.floor(this.config.GAS_PRICE_MULTIPLIER! * 100))) / 100n;

      const hash = await this.walletClient.writeContract({
        address: CONDITIONAL_TOKENS_ADDRESS,
        abi: conditionalTokensAbi,
        functionName: "redeemPositions",
        args: [
          USDC_COLLATERAL_ADDRESS,
          "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`, // parentCollectionId (bytes32(0))
          conditionID,
          indexSets,
        ],
        gasPrice: premiumGasPrice,
      });

      logger.info({ conditionID, hash }, "Redemption transaction submitted");

      // Wait for transaction receipt
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        logger.info({ conditionID, hash }, "Positions redeemed successfully");
      } else {
        logger.error({ conditionID, hash }, "Redemption transaction failed");
      }

      return hash;
    } catch (error: any) {
      // Handle execution reverted errors gracefully
      if (error.message?.includes("execution reverted") || error.message?.includes("revert")) {
        logger.warn({ conditionID, error: error.message }, "Redemption failed (may already be redeemed)");
        throw new Error("REDEMPTION_FAILED");
      }
      logger.error({ conditionID, error }, "Error redeeming positions");
      throw error;
    }
  }

  /**
   * Process a market: resolve if expired, then redeem
   */
  async processMarket(questionID: `0x${string}`, conditionID: `0x${string}`): Promise<void> {
    try {
      const status = await this.checkMarketStatus(questionID);

      if (status.isExpired && !status.isResolved) {
        try {
          await this.resolveMarket(questionID);
          // Wait a bit for the resolution to be mined
          await new Promise((resolve) => setTimeout(resolve, 5000));
        } catch (error: any) {
          if (error.message === "MARKET_ALREADY_RESOLVED") {
            logger.info({ questionID }, "Market already resolved, proceeding to redeem");
          } else {
            throw error;
          }
        }
      }

      // Attempt redemption
      try {
        await this.redeemPositions(conditionID);
      } catch (error: any) {
        if (error.message === "REDEMPTION_FAILED") {
          logger.warn({ conditionID }, "Redemption failed, may already be redeemed");
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.error({ questionID, conditionID, error }, "Error processing market");
      throw error;
    }
  }
}

