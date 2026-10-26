export interface ReplayOrder {
  id: string;
  type: "market" | "limit" | "stop";
  side: "buy" | "sell";
  quantity: number;
  price?: number;
  stopPrice?: number;
  timestamp: number;
  reduceOnly?: boolean;
  symbol?: string;
  feeRate?: number;
}

export interface FillResult {
  filled: boolean;
  fillPrice: number;
  fillQuantity: number;
  fillTimestamp: number;
  partial: boolean;
  remainingQuantity: number;
  error?: string;
}

export interface ReplayPosition {
  id: string;
  side: "long" | "short";
  entryPrice: number;
  quantity: number;
  currentPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  stopLoss?: number;
  takeProfit?: number;
  entryTimestamp: number;
  entryBarIndex: number;
  symbol?: string;
  feeRate?: number;
}

export interface ReplayExecutedTrade {
  id: string;
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop";
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  entryTimestamp: number;
  exitTimestamp: number;
  entryBarIndex: number;
  exitBarIndex: number;
  barsHeld: number;
  exitReason: "tp" | "sl" | "manual" | "session-end";
}

export interface ReplayOHLCBar {
  open: number;
  high: number;
  low: number;
  close: number;
  date: Date | number;
}
