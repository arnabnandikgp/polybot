import { ClobClient, Chain, OrderType, Side } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";
import pino from "pino";
import type { AppConfig, TargetMarket } from "./types.js";

const logger = pino({ level: "info" });

const TARGET_PRICE = 0.99; // Target price for buying winning outcome shares
const CLOB_HOST = "https://clob.polymarket.com";

export class Sniper {
  private clobClient: ClobClient;
  private isRunning = false;

  constructor(config: AppConfig) {
    // Create wallet from private key for signing
    const wallet = new Wallet(config.PRIVATE_KEY);

    // Initialize CLOB client with authentication
    this.clobClient = new ClobClient(
      CLOB_HOST,
      Chain.POLYGON,
      wallet,
      {
        key: config.POLYMARKET_API_KEY,
        secret: config.POLYMARKET_SECRET,
        passphrase: config.POLYMARKET_PASSPHRASE,
      }
    );

    logger.info("Sniper initialized");
  }

  /**
   * Fetch order book for a token
   */
  private async getOrderBook(tokenID: string): Promise<{
    bestAskPrice: number;
    bestBidPrice: number;
  } | null> {
    try {
      const orderBook = await this.clobClient.getOrderBook(tokenID);

      if (!orderBook || !orderBook.asks || orderBook.asks.length === 0) {
        return null;
      }

      const bestAsk = orderBook.asks[0];
      if (!bestAsk) {
        return null;
      }

      const bestBid = orderBook.bids?.[0];

      return {
        bestAskPrice: parseFloat(bestAsk.price),
        bestBidPrice: bestBid ? parseFloat(bestBid.price) : 0,
      };
    } catch (error) {
      logger.error({ tokenID, error }, "Error fetching order book");
      return null;
    }
  }

  /**
   * Determine which outcome is the winner
   * This is a simplified version - in production, you'd need to check the actual market resolution
   * For now, returns null as a placeholder - this needs to be implemented based on actual market resolution
   */
  private async determineWinner(_market: TargetMarket): Promise<"Yes" | "No" | null> {
    // TODO: Implement logic to determine winner based on market resolution
    // For now, we'll assume we need to check the UMA Oracle or market state
    // This is a placeholder - you'll need to implement actual winner detection
    return null;
  }

  /**
   * Execute a buy order for a token at a limit price
   */
  private async buyAtLimit(
    tokenID: string,
    price: number,
    size: number = 1
  ): Promise<boolean> {
    try {
      logger.info({ tokenID, price, size }, "Placing buy order");

      // Create and post a FOK (Fill-Or-Kill) market order
      // Using market order with FOK type for immediate execution
      const order = await this.clobClient.createAndPostMarketOrder(
        {
          tokenID,
          side: Side.BUY,
          amount: size, // For BUY orders, amount is in USD
          price, // Limit price
          orderType: OrderType.FOK,
        },
        {}
      );

      logger.info({ tokenID, order }, "Buy order placed successfully");
      return true;
    } catch (error: any) {
      // Handle insufficient balance gracefully
      if (
        error.message?.includes("INSUFFICIENT_BALANCE") ||
        error.message?.includes("insufficient") ||
        error.message?.includes("balance")
      ) {
        logger.warn({ tokenID, error: error.message }, "Insufficient balance, stopping buys");
        this.isRunning = false;
        return false;
      }

      logger.error({ tokenID, error }, "Error placing buy order");
      return false;
    }
  }

  /**
   * Process a target market and execute buy orders if conditions are met
   */
  async processMarket(market: TargetMarket): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Determine winner (this needs to be implemented based on actual market resolution)
      const winner = await this.determineWinner(market);
      if (!winner) {
        logger.debug({ market: market.slug }, "Could not determine winner, skipping");
        return;
      }

      // Find the winning token
      const winningToken = market.tokens.find(
        (token) => token.outcome === winner
      );

      if (!winningToken) {
        logger.warn({ market: market.slug, winner }, "Winning token not found");
        return;
      }

      // Get order book for winning token
      const orderBook = await this.getOrderBook(winningToken.tokenID);
      if (!orderBook) {
        logger.debug(
          { tokenID: winningToken.tokenID },
          "No order book data available"
        );
        return;
      }

      // Check if best ask price is below target
      if (orderBook.bestAskPrice < TARGET_PRICE) {
        logger.info(
          {
            market: market.slug,
            tokenID: winningToken.tokenID,
            bestAskPrice: orderBook.bestAskPrice,
            targetPrice: TARGET_PRICE,
          },
          "Trigger condition met, executing buy order"
        );

        // Execute buy order
        await this.buyAtLimit(winningToken.tokenID, orderBook.bestAskPrice);
      } else {
        logger.debug(
          {
            market: market.slug,
            bestAskPrice: orderBook.bestAskPrice,
            targetPrice: TARGET_PRICE,
          },
          "Price not favorable, waiting"
        );
      }
    } catch (error) {
      logger.error({ market: market.slug, error }, "Error processing market in Sniper");
    }
  }

  /**
   * Start monitoring and executing orders
   */
  start(): void {
    this.isRunning = true;
    logger.info("Sniper started");
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isRunning = false;
    logger.info("Sniper stopped");
  }
}

