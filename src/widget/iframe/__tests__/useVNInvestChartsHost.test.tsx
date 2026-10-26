/**
 * useVNInvestChartsHost regression lock (BUG-03: real hook, not a stub).
 *
 * NOTE: mock factories here use static imports on purpose — nested dynamic
 * imports inside vi.mock factories silently disable interception in this
 * repo's vitest setup.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

const createMock = vi.hoisted(() => vi.fn());

vi.mock("../hostSDK", () => ({
	createVNInvestChartsHost: createMock,
}));

import { useVNInvestChartsHost, type UseVNInvestChartsHostResult } from "../useVNInvestChartsHost";
import type { HostSDKConfig } from "../hostSDK";

function mountHook(config: HostSDKConfig): { latest: () => UseVNInvestChartsHostResult; unmount: () => void } {
	let latest: UseVNInvestChartsHostResult | null = null;
	function Harness() {
		latest = useVNInvestChartsHost(config);
		return null;
	}
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => {
		root.render(React.createElement(Harness));
	});
	return {
		latest: () => {
			if (!latest) throw new Error("hook did not run");
			return latest;
		},
		unmount: () => {
			act(() => {
				root.unmount();
			});
			container.remove();
		},
	};
}

async function flush() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

const baseConfig = { iframe: "#chart-frame" } as unknown as HostSDKConfig;

beforeEach(() => {
	createMock.mockReset();
});

afterEach(() => {
	createMock.mockReset();
});

describe("useVNInvestChartsHost (BUG-03)", () => {
	it("connects and exposes sdk + controller (not a null stub)", async () => {
		const controller = { setRoute: () => {} };
		const disconnect = vi.fn();
		const sdk = { getController: () => controller, disconnect };
		createMock.mockResolvedValue(sdk);

		const mounted = mountHook(baseConfig);
		expect(mounted.latest().connecting).toBe(true);
		expect(mounted.latest().sdk).toBeNull();

		await flush();

		expect(createMock).toHaveBeenCalledTimes(1);
		expect(mounted.latest().connecting).toBe(false);
		expect(mounted.latest().error).toBeNull();
		expect(mounted.latest().sdk).toBe(sdk);
		expect(mounted.latest().controller).toBe(controller);
		mounted.unmount();
		expect(disconnect).toHaveBeenCalledTimes(1);
	});

	it("surfaces connection errors instead of fake success", async () => {
		createMock.mockRejectedValue(new Error("Connection timeout"));
		const mounted = mountHook(baseConfig);
		await flush();

		expect(mounted.latest().connecting).toBe(false);
		expect(mounted.latest().sdk).toBeNull();
		expect(mounted.latest().error?.message).toBe("Connection timeout");
		mounted.unmount();
	});

	it("disconnects a late-resolving instance on unmount (no state update after)", async () => {
		let resolveConnect!: (sdk: unknown) => void;
		createMock.mockReturnValue(new Promise((resolve) => { resolveConnect = resolve as (sdk: unknown) => void; }));
		const disconnect = vi.fn();
		const mounted = mountHook(baseConfig);
		mounted.unmount();
		resolveConnect({ getController: () => ({}), disconnect });
		await flush();
		expect(disconnect).toHaveBeenCalledTimes(1);
	});
});
