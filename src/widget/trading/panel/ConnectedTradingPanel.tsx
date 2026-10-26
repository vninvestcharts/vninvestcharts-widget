// Task 10: bridge context -> panel props (giữ panel + tests Task 09 nguyên vẹn).
import { useTradingContext } from "../context/TradingContext";
import { TradingBottomPanel } from "./TradingBottomPanel";

export function ConnectedTradingPanel({ onClose }: { onClose?: () => void }) {
	const { panelProps } = useTradingContext();
	return <TradingBottomPanel {...panelProps} onClose={onClose} />;
}
