import axios from "axios";
import pino from "pino";
import type { MarketInfo, TargetMarket } from "./types.js";

const logger = pino({ level: "info" });

const GAMMA_API_URL = "https://gamma-api.polymarket.com/markets";
const POLL_INTERVAL_MS = 60000; // 60 seconds
const EXPIRATION_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export class Scout {
  private targetMarkets: Map<string, TargetMarket> = new Map();
  private pollInterval: NodeJS.Timeout | undefined;

  /**
   * Fetch markets from Gamma API
   */
  private async fetchMarkets(): Promise<MarketInfo[]> {
    try {
      const response = await axios.get(GAMMA_API_URL, {
        params: {
          active: true,
        },
      });

      const markets: MarketInfo[] = [];

      for (const market of response.data) {
        try {
          // Extract required fields from Gamma API response
          const questionID = market.question_id || market.questionID;
          const conditionID = market.condition_id || market.conditionID;
          const slug = market.slug;
          const umaEndDate = market.uma_end_date || market.expiration;

          if (!questionID || !conditionID || !slug) {
            logger.debug({ market: market.id }, "Skipping market with missing fields");
            continue;
          }

          // Parse expiration timestamp
          const expirationTimestamp = umaEndDate
            ? Math.floor(new Date(umaEndDate).getTime() / 1000)
            : null;

          if (!expirationTimestamp) {
            logger.debug({ market: market.id }, "Skipping market with missing expiration");
            continue;
          }

          // Extract tokens/outcomes
          const tokens = [];
          if (market.tokens) {
            for (const token of market.tokens) {
              tokens.push({
                outcome: token.outcome as "Yes" | "No",
                tokenID: token.token_id || token.tokenID,
                winner: false, // Will be determined later based on market resolution
              });
            }
          }

          markets.push({
            id: market.id || market.slug,
            questionID,
            conditionID,
            slug,
            expirationTimestamp,
            tokens,
          });
        } catch (error) {
          logger.warn({ market: market.id, error }, "Error parsing market");
        }
      }

      return markets;
    } catch (error) {
      logger.error({ error }, "Error fetching markets from Gamma API");
      throw error;
    }
  }

  /**
   * Filter markets that are expiring within the next 15 minutes
   */
  private filterExpiringMarkets(markets: MarketInfo[]): MarketInfo[] {
    const now = Math.floor(Date.now() / 1000);
    const expirationThreshold = now + Math.floor(EXPIRATION_WINDOW_MS / 1000);

    return markets.filter((market) => {
      const timeUntilExpiration = market.expirationTimestamp - now;
      const isExpiringSoon =
        market.expirationTimestamp <= expirationThreshold &&
        market.expirationTimestamp > now;

      if (isExpiringSoon) {
        logger.info(
          {
            market: market.slug,
            expirationTimestamp: market.expirationTimestamp,
            timeUntilExpiration,
          },
          "Found expiring market"
        );
      }

      return isExpiringSoon;
    });
  }

  /**
   * Update target markets list
   */
  private async updateTargetMarkets(): Promise<void> {
    try {
      const allMarkets = await this.fetchMarkets();
      const expiringMarkets = this.filterExpiringMarkets(allMarkets);

      // Update the target markets map
      const newTargetMarkets = new Map<string, TargetMarket>();

      for (const market of expiringMarkets) {
        newTargetMarkets.set(market.questionID, market);
        if (!this.targetMarkets.has(market.questionID)) {
          logger.info(
            { market: market.slug, questionID: market.questionID },
            "New target market discovered"
          );
        }
      }

      // Remove markets that are no longer expiring soon
      for (const [questionID, market] of this.targetMarkets.entries()) {
        if (!newTargetMarkets.has(questionID)) {
          logger.info(
            { market: market.slug, questionID },
            "Market no longer in expiration window"
          );
        }
      }

      this.targetMarkets = newTargetMarkets;
      logger.info(
        { count: this.targetMarkets.size },
        "Target markets updated"
      );
    } catch (error) {
      logger.error({ error }, "Error updating target markets");
    }
  }

  /**
   * Start polling for markets
   */
  start(): void {
    logger.info("Starting Scout polling");
    
    // Initial fetch
    this.updateTargetMarkets();

    // Set up polling interval
    this.pollInterval = setInterval(() => {
      this.updateTargetMarkets();
    }, POLL_INTERVAL_MS);
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
      logger.info("Scout polling stopped");
    }
  }

  /**
   * Get current target markets
   */
  getTargetMarkets(): TargetMarket[] {
    return Array.from(this.targetMarkets.values());
  }

  /**
   * Get a specific target market by questionID
   */
  getTargetMarket(questionID: string): TargetMarket | undefined {
    return this.targetMarkets.get(questionID);
  }
}

