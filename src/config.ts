import dotenv from "dotenv";
import type { AppConfig } from "./types.js";

dotenv.config();

function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvVarOptional(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function loadConfig(): AppConfig {
  const httpUrl = process.env["RPC_URL_HTTP"];
  return {
    RPC_URL_WSS: getEnvVar("RPC_URL_WSS"),
    ...(httpUrl && { RPC_URL_HTTP: httpUrl }),
    PRIVATE_KEY: getEnvVar("PRIVATE_KEY") as `0x${string}`,
    POLYMARKET_API_KEY: getEnvVar("POLYMARKET_API_KEY"),
    POLYMARKET_SECRET: getEnvVar("POLYMARKET_SECRET"),
    POLYMARKET_PASSPHRASE: getEnvVar("POLYMARKET_PASSPHRASE"),
    GAS_PRICE_MULTIPLIER: parseFloat(
      getEnvVarOptional("GAS_PRICE_MULTIPLIER", "1.1")
    ),
  };
}

