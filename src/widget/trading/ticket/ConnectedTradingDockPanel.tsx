// Task TVP-B2: bridge context -> dock ticket (giữ TradingDockPanel presentational).
import { useTradingContext } from "../context/TradingContext";
import { TradingDockPanel } from "./TradingDockPanel";

export function ConnectedTradingDockPanel({ canUseAdvancedOrders, canUseReplayTrading, isReplayMode }: { canUseAdvancedOrders?: boolean; canUseReplayTrading?: boolean; isReplayMode?: boolean }) {
	const trading = useTradingContext();
	const quote = trading.port.getLatestQuote(trading.symbol);
	const mark = quote?.lastPrice ?? 0;
	const account = trading.broker.getAccount();
	return (
		<TradingDockPanel
			symbol={trading.symbol}
			lastPrice={mark}
			disabled={!trading.tradingEnabled}
			canUseAdvancedOrders={canUseAdvancedOrders}
			canUseReplayTrading={canUseReplayTrading}
			isReplayMode={isReplayMode}
			rules={trading.rules}
			account={{ equity: account.equity, freeMargin: account.freeMargin, buyingPower: account.buyingPower }}
			currentPosition={trading.broker.getPositions().find((p) => p.symbol === trading.symbol)}
			onSubmit={(order) => {
				trading.broker.placeOrder(order);
			}}
		/>
	);
}
