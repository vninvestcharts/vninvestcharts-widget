/**
 * Symbol search SSOT constants (SYMBOL_SEARCH P1).
 * Single definition surface for futures/crypto fallbacks, timeframe
 * aliases, recent-storage key and exchange filter options.
 */
import type { SymbolSearchItem } from "../types/symbolSearch";

export const RECENT_SYMBOLS_KEY = "vni_recent_symbols";
export const MAX_RECENT = 10;

export type ExchangeFilter = "ALL" | "HOSE" | "HNX" | "UPCOM";
export const EXCHANGE_OPTIONS: ExchangeFilter[] = ["ALL", "HOSE", "HNX", "UPCOM"];

// Known timeframe aliases for inline search parsing (e.g. "BTCUSDT 1D", "VIC 1H")
export const TIMEFRAME_ALIASES: Record<string, string> = {
	"1": "1m", "1m": "1m", "1min": "1m", "1 minute": "1m",
	"5": "5m", "5m": "5m", "5min": "5m", "5 minute": "5m",
	"15": "15m", "15m": "15m", "15min": "15m",
	"30": "30m", "30m": "30m", "30min": "30m",
	"1h": "1h", "1hour": "1h", "1 hour": "1h",
	"4h": "4h", "4hour": "4h", "4 hour": "4h",
	"1d": "1D", "1day": "1D", "1 day": "1D", "d": "1D",
	"1w": "1W", "1week": "1W", "1 week": "1W", "w": "1W",
	"1M": "1M", "1month": "1M", "1 month": "1M", "mo": "1M",
};

export const FUTURES_SYMBOLS: SymbolSearchItem[] = [
	{ symbol: "VN30F1M", company_name: "VN30 Continuous 1 Month Futures", exchange: "HNX" },
	{ symbol: "VN30F3M", company_name: "VN30 Continuous 3 Month Futures", exchange: "HNX" }
];

// Common crypto symbols as fallback when stock adapter returns no matches
export const CRYPTO_SYMBOLS: SymbolSearchItem[] = [
	{ symbol: "BTCUSDT", company_name: "Bitcoin / Tether", exchange: "CRYPTO" },
	{ symbol: "ETHUSDT", company_name: "Ethereum / Tether", exchange: "CRYPTO" },
	{ symbol: "BNBUSDT", company_name: "BNB / Tether", exchange: "CRYPTO" },
	{ symbol: "SOLUSDT", company_name: "Solana / Tether", exchange: "CRYPTO" },
	{ symbol: "XRPUSDT", company_name: "Ripple / Tether", exchange: "CRYPTO" },
	{ symbol: "ADAUSDT", company_name: "Cardano / Tether", exchange: "CRYPTO" },
	{ symbol: "DOGEUSDT", company_name: "Dogecoin / Tether", exchange: "CRYPTO" },
	{ symbol: "AVAXUSDT", company_name: "Avalanche / Tether", exchange: "CRYPTO" },
	{ symbol: "DOTUSDT", company_name: "Polkadot / Tether", exchange: "CRYPTO" },
	{ symbol: "LINKUSDT", company_name: "Chainlink / Tether", exchange: "CRYPTO" },
];

// VN30 basket stays defined in constants/vn30.ts — re-exported here for a single import surface.
export { VN30_SYMBOLS } from "./vn30";
