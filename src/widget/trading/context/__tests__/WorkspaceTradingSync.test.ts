import { describe, it, expect, vi } from "vitest";
import { WorkspaceTradingSync } from "../WorkspaceTradingSync";
import type { BroadcastChannelAdapter } from "@vninvestcharts/engine-react";

// Task 10: sync qua adapter inject được — deterministic, không phụ thuộc env.
function loopbackPair() {
	const handlers = new Set<(message: any) => void>();
	const adapter = {
		postMessage: (message: any) => {
			handlers.forEach((handler) => handler(message));
		},
		onMessage: (handler: any) => {
			handlers.add(handler);
			return () => {
				handlers.delete(handler);
			};
		},
		close: () => undefined,
		isAvailable: () => true,
	} as unknown as BroadcastChannelAdapter;
	const a = new WorkspaceTradingSync("ws-test", "chart-a", adapter);
	const b = new WorkspaceTradingSync("ws-test", "chart-b", adapter);
	return { a, b };
}

const snapshot = {
	account: {
		accountId: "paper",
		balance: 90_000_000,
		equity: 90_000_000,
		marginUsed: 0,
		freeMargin: 90_000_000,
		buyingPower: 90_000_000,
		currency: "VND",
		pnl: 0,
		pnlPercent: 0,
	},
	positions: [],
	orders: [],
};

describe("WorkspaceTradingSync", () => {
	it("broadcast từ chart-a -> chart-b nhận đủ snapshot + fromId", () => {
		const { a, b } = loopbackPair();
		const handler = vi.fn();
		b.subscribe(handler);
		a.broadcastState(snapshot);
		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0][1]).toBe("chart-a");
		expect(handler.mock.calls[0][0].account.balance).toBe(90_000_000);
	});

	it("không echo lại chính mình", () => {
		const { a } = loopbackPair();
		const handler = vi.fn();
		a.subscribe(handler);
		a.broadcastState(snapshot);
		expect(handler).not.toHaveBeenCalled();
	});

	it("bỏ qua domain lạ và type lạ", () => {
		const handlers = new Set<(message: any) => void>();
		const raw = {
			postMessage: (message: any) => {
				handlers.forEach((handler) => handler(message));
			},
			onMessage: (handler: any) => {
				handlers.add(handler);
				return () => undefined;
			},
			close: () => undefined,
			isAvailable: () => true,
		} as unknown as BroadcastChannelAdapter;
		const sync = new WorkspaceTradingSync("ws-test", "chart-a", raw);
		const handler = vi.fn();
		sync.subscribe(handler);
		raw.postMessage({ type: "crosshair", payload: {}, workspaceId: "ws-test", sourceTabId: "x", timestamp: 1 });
		raw.postMessage({
			type: "workspace",
			payload: { domain: "other-feature", fromId: "chart-b" },
			workspaceId: "ws-test",
			sourceTabId: "chart-b",
			timestamp: 1,
		});
		expect(handler).not.toHaveBeenCalled();
	});

	it("adapter null -> broadcast/subscribe/dispose an toàn", () => {
		const sync = new WorkspaceTradingSync("ws-test", "chart solo", null);
		expect(() => sync.broadcastState(snapshot)).not.toThrow();
		const off = sync.subscribe(() => {
			throw new Error("must not fire");
		});
		expect(() => off()).not.toThrow();
		expect(() => sync.dispose()).not.toThrow();
	});
});
