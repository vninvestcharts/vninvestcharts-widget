import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { TradingProvider, useTradingContext, type TradingContextValue } from "../TradingContext";
import { useReplayTrading, type UseReplayTradingResult } from "../../../hooks/useReplayTrading";
import { usePaperTradeInteraction, type UsePaperTradeInteractionResult } from "../../../hooks/usePaperTradeInteraction";
import type { ReplayOHLCBar } from "../../../../lib/core/replay/replayTradingTypes";

const BARS: ReplayOHLCBar[] = [
	{ open: 100, high: 102, low: 99, close: 100, date: 1000 },
	{ open: 100, high: 104, low: 99, close: 103, date: 2000 },
	{ open: 103, high: 106, low: 102, close: 105, date: 3000 },
];

interface HarnessSlot {
	context: TradingContextValue;
	replay: UseReplayTradingResult;
	interaction: UsePaperTradeInteractionResult;
}

function Harness({ currentBar, slot }: { currentBar: number; slot: { current: HarnessSlot | null } }) {
	const replay = useReplayTrading({
		currentBar,
		bars: BARS,
		enabled: true,
		symbol: "FPT",
		sessionEpoch: 0,
	});
	const interaction = usePaperTradeInteraction({
		replayTrading: replay,
		replayActive: true,
		resolveActiveTool: () => "cursor",
		defaultQty: 10,
		symbol: "FPT",
		feeRate: 0,
	});

	function Probe() {
		slot.current = { context: useTradingContext(), replay, interaction };
		return null;
	}

	return (
		<TradingProvider
			symbol="FPT"
			bars={[]}
			replayActive
			replayPlaying={false}
			replayBar={BARS[currentBar] ?? null}
			externalReplayBroker={replay.broker}
			externalReplayPort={replay.port}
			replayEpoch={0}
		>
			<Probe />
		</TradingProvider>
	);
}

describe("TradingOneBook A6", () => {
	it("orders placed through usePaperTradeInteraction are visible on useTradingContext().broker", () => {
		const slot: { current: HarnessSlot | null } = { current: null };
		const { rerender } = render(<Harness currentBar={0} slot={slot} />);

		act(() => {
			slot.current!.interaction.wrappedOnClick(
				{ currentItem: { date: 1000, close: 100, open: 100, high: 102, low: 99 } },
				{},
			);
		});
		rerender(<Harness currentBar={1} slot={slot} />);

		const { context, replay } = slot.current!;
		expect(context.broker).toBe(replay.broker);
		expect(context.port).toBe(replay.port);
		expect(replay.positions).toHaveLength(1);
		expect(context.broker.getPositions()).toHaveLength(1);
		expect(context.broker.getPositions()[0]?.symbol).toBe("FPT");
	});

	it("orders placed through useTradingContext().broker reach the replay hook book", () => {
		const slot: { current: HarnessSlot | null } = { current: null };
		const { rerender } = render(<Harness currentBar={0} slot={slot} />);
		rerender(<Harness currentBar={1} slot={slot} />);

		act(() => {
			slot.current!.context.broker.placeOrder({
				symbol: "FPT",
				side: "buy",
				type: "market",
				quantity: 100,
			});
		});
		rerender(<Harness currentBar={2} slot={slot} />);

		const { context, replay } = slot.current!;
		expect(replay.positions).toHaveLength(1);
		expect(context.broker.getPositions()).toHaveLength(1);
		expect(replay.totalPnl).toBe(context.broker.getPositions()[0]?.unrealizedPnl);
	});

	it("source-lock: multi chart keeps the local replay book disabled and feeds only the owner", () => {
		const source = readFileSync(resolve(process.cwd(), "src/widget/VNInvestCharts.tsx"), "utf8");
		expect(source).toContain("enabled: Boolean(replay.sessionActive && !workspaceReplay),");
		expect(source).toContain("const isReplayFeedActive = Boolean(workspaceReplay && isSessionOwner && replay.sessionActive && replayBars.length > 0);");
		expect(source).toContain("externalReplayBroker={replayTrading.broker}");
		expect(source).not.toContain("reportReplayActive");
	});
});
