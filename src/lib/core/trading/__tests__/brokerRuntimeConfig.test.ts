import { describe, expect, it } from "vitest";
import { VirtualBrokerEngine } from "../VirtualBrokerEngine";
import { InMemoryStorageAdapter } from "../storage/InMemoryStorageAdapter";
import { VN_SPOT_RULES } from "../MarketRules";
import type { ReplayOHLCBar } from "../../replay/replayTradingTypes";

function bar(o: number, h: number, l: number, c: number): ReplayOHLCBar {
	return { open: o, high: h, low: l, close: c, date: 0 };
}

describe("applyRuntimeConfig (S2 cascade)", () => {
	it("fee switch mid-session: old fills keep old fee, new fills use new fee, positions survive", () => {
		const broker = new VirtualBrokerEngine({
			rules: VN_SPOT_RULES,
			storageAdapter: new InMemoryStorageAdapter(),
			initialBalance: 100_000_000,
		});
		broker.onBar("FPT", bar(128000, 128400, 127800, 128200), 1);
		broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		broker.onBar("FPT", bar(128500, 129000, 128000, 128800), 2);
		const firstCommission = broker.getHistory()[0].commission;
		expect(firstCommission).toBe(12850);

		const summary = broker.applyRuntimeConfig({ simulatorOptions: { brokerFeeRate: 0 } });
		expect(summary.profile).toBe("VN_SPOT");
		expect(summary.simulator.brokerFeeRate).toBe(0);

		broker.onBar("FPT", bar(128800, 129200, 128400, 129000), 3);
		broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		broker.onBar("FPT", bar(129000, 129500, 128800, 129200), 4);

		const history = broker.getHistory();
		expect(history).toHaveLength(2);
		expect(history[0].commission).toBe(12850);
		expect(history[1].commission).toBe(0);
		// Open position untouched by the switch.
		expect(broker.getPositions()).toHaveLength(1);
		expect(broker.getPositions()[0].quantity).toBe(200);
	});

	it("rules swap propagates to validation without broker recreate", () => {
		const broker = new VirtualBrokerEngine({
			rules: VN_SPOT_RULES,
			storageAdapter: new InMemoryStorageAdapter(),
			initialBalance: 100_000_000,
		});
		broker.onBar("FPT", bar(128000, 128400, 127800, 128200), 1);
		// Short selling newly allowed at runtime → naked short works.
		broker.applyRuntimeConfig({ rules: { ...VN_SPOT_RULES, allowShortSelling: true } });
		const shorted = broker.placeOrder({ symbol: "FPT", side: "sell", type: "market", quantity: 100 });
		expect(shorted.status).toBe("working");
		broker.onBar("FPT", bar(128200, 128600, 127900, 128100), 3);
		expect(broker.getPositions()).toHaveLength(1);
		expect(broker.getPositions()[0].side).toBe("short");
		// Revoked again → second naked short rejected, open short untouched.
		broker.applyRuntimeConfig({ rules: { ...VN_SPOT_RULES, allowShortSelling: false } });
		const rejected = broker.placeOrder({ symbol: "FPT", side: "sell", type: "market", quantity: 100 });
		expect(rejected.status).toBe("rejected");
		expect(broker.getPositions()).toHaveLength(1);
	});
});
