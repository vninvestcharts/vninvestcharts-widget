// Task TVP-A4: ký quỹ phong tỏa bởi lệnh working (cho header Orders margin).
// Lệnh đóng (ngược chiều net đủ cover) tốn 0; đảo chiều chỉ tính phần dôi.
import { RiskEngine } from "./RiskEngine";
import type { MarketRules } from "./MarketRules";
import type { TradingOrder, TradingPosition } from "./types";

const riskEngine = new RiskEngine();

export function workingOrdersMargin(
	orders: TradingOrder[],
	positions: TradingPosition[],
	rules: MarketRules,
	markPrices: Record<string, number>,
): number {
	let total = 0;
	for (const order of orders) {
		if (order.status !== "working" && order.status !== "pending") continue;
		const price = order.price ?? order.stopPrice ?? markPrices[order.symbol] ?? 0;
		if (!(price > 0) || !(order.quantity > 0)) continue;
		const net = positions.find((p) => p.symbol === order.symbol);
		const oppositeCovered =
			net != null && ((net.side === "long") === (order.side === "sell")) ? Math.min(net.quantity, order.quantity) : 0;
		const marginQty = order.quantity - oppositeCovered;
		if (marginQty <= 0) continue;
		total += riskEngine.calculateOrderMargin({ quantity: marginQty }, rules, price).totalRequiredMargin;
	}
	return total;
}
