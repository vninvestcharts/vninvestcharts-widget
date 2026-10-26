// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useWatchlistRealtimeSync } from "../../../widget/adapters/watchlistRealtimeSync";
import { VNInvestWebSocketClient } from "../../../widget/adapters/VNInvestWebSocketClient";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

// Simple test helper component
function TestComponent({
	wsClient,
	symbols,
	onUpdate,
}: {
	wsClient: VNInvestWebSocketClient | null;
	symbols: string[];
	onUpdate?: (data: any) => void;
}) {
	const tickerData = useWatchlistRealtimeSync({ wsClient, symbols, onUpdate, throttleMs: 50 });
	return (
		<div>
			{Array.from(tickerData.entries()).map(([sym, event]) => (
				<div key={sym} data-testid={sym}>
					{sym}: {event.current_price}
				</div>
			))}
		</div>
	);
}

describe("useWatchlistRealtimeSync hook", () => {
	let mockWs: any;
	let container: HTMLDivElement | null = null;
	let root: any = null;

	beforeEach(() => {
		vi.useFakeTimers();
		mockWs = {
			subscribe: vi.fn(),
			unsubscribe: vi.fn(),
			setOnTickerUpdate: vi.fn(),
		};
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => {
			root?.unmount();
		});
		container?.remove();
		container = null;
		root = null;
		vi.useRealTimers();
	});

	it("subscribes on mount and unsubscribes on unmount", async () => {
		await act(async () => {
			root.render(<TestComponent wsClient={mockWs} symbols={["VRE", "VCB"]} />);
		});

		expect(mockWs.subscribe).toHaveBeenCalledWith(["VRE", "VCB"]);
		expect(mockWs.setOnTickerUpdate).toHaveBeenCalled();

		await act(async () => {
			root.unmount();
			root = null;
		});
		expect(mockWs.unsubscribe).toHaveBeenCalledWith(["VRE", "VCB"]);
	});

	it("flushes updates to state after throttle interval", async () => {
		let cb: any = null;
		mockWs.setOnTickerUpdate.mockImplementation((handler: any) => {
			cb = handler;
		});

		const onUpdate = vi.fn();
		await act(async () => {
			root.render(
				<TestComponent wsClient={mockWs} symbols={["VRE", "VCB"]} onUpdate={onUpdate} />
			);
		});

		// Trigger tick
		act(() => {
			cb({
				event_type: "ticker_update",
				symbol: "VRE",
				price: 24000,
				current_price: 24500,
				ts: "2026-06-12T18:00:00Z",
				seq: 1,
			});
		});

		// Should not render yet due to throttling
		expect(container?.querySelector('[data-testid="VRE"]')).toBeNull();

		// Advance timers by 50ms
		act(() => {
			vi.advanceTimersByTime(50);
		});

		// Now should be rendered
		const vreElement = container?.querySelector('[data-testid="VRE"]');
		expect(vreElement).not.toBeNull();
		expect(vreElement?.textContent).toContain("VRE: 24500");
		expect(onUpdate).toHaveBeenCalledOnce();
	});
});

