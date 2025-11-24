import pino from "pino";
import { loadConfig } from "./config.js";
import { Scout } from "./scout.js";
import { Sniper } from "./sniper.js";
import { Settler } from "./settler.js";
import { createPublicClient, webSocket } from "viem";
import { polygon } from "viem/chains";

const logger = pino({ level: "info" });

async function main() {
  try {
    logger.info("Starting Polymarket Arbitrage Bot");

    // Load configuration
    const config = loadConfig();
    logger.info("Configuration loaded");

    // Initialize modules
    const scout = new Scout();
    const sniper = new Sniper(config);
    const settler = new Settler(config);

    // Start Scout (polls for markets)
    scout.start();

    // Start Sniper (monitors prices and executes orders)
    sniper.start();

    // Set up Settler block listener
    const publicClient = createPublicClient({
      chain: polygon,
      transport: webSocket(config.RPC_URL_WSS),
    });

    // Listen for new blocks and process markets
    publicClient.watchBlocks({
      onBlock: async (block) => {
        try {
          const markets = scout.getTargetMarkets();
          
          logger.debug(
            { blockNumber: block.number, marketCount: markets.length },
            "New block received, processing markets"
          );

          // Process each market
          for (const market of markets) {
            // Sniper: Check prices and execute buy orders
            await sniper.processMarket(market);

            // Settler: Check if market needs resolution/redemption
            try {
              await settler.processMarket(
                market.questionID as `0x${string}`,
                market.conditionID as `0x${string}`
              );
            } catch (error: any) {
              // Handle errors gracefully (market already resolved, etc.)
              if (
                error.message === "MARKET_ALREADY_RESOLVED" ||
                error.message === "REDEMPTION_FAILED"
              ) {
                logger.debug(
                  { market: market.slug, error: error.message },
                  "Market processing skipped (expected)"
                );
              } else {
                logger.error(
                  { market: market.slug, error },
                  "Error processing market in Settler"
                );
              }
            }
          }
        } catch (error) {
          logger.error({ error }, "Error in block handler");
        }
      },
    });

    logger.info("Bot is running. Press Ctrl+C to stop.");

    // Graceful shutdown
    process.on("SIGINT", () => {
      logger.info("Shutting down...");
      scout.stop();
      sniper.stop();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      logger.info("Shutting down...");
      scout.stop();
      sniper.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error({ error }, "Fatal error in main");
    process.exit(1);
  }
}

// Run the bot
main().catch((error) => {
  logger.error({ error }, "Unhandled error");
  process.exit(1);
});

