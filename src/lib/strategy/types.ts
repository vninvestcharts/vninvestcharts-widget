export interface Order {
	id: string;
	symbol: string;
	direction: "buy" | "sell";
	type: "market" | "limit";
	price?: number;
	qty: number;
	timestamp: number;
}

export interface Position {
	symbol: string;
	qty: number;
	avgPrice: number;
	direction: "long" | "short";
}

export interface TradeRecord {
	id: string;
	direction: "long" | "short";
	qty: number;
	entryPrice: number;
	entryTime: number;
	exitPrice: number;
	exitTime: number;
	pnl: number;
	pnlPercent: number;
}

export interface PerformanceReport {
	initialBalance: number;
	finalBalance: number;
	netProfit: number;
	winRate: number;
	profitFactor: number;
	totalTrades: number;
	trades: TradeRecord[];
}
