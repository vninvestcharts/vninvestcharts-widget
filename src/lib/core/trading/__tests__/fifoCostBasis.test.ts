import { describe, expect, it } from "vitest";
import { PositionManager } from "../PositionManager";

function open(pms: PositionManager, quantity: number, price: number, timestamp: number): string {
	return pms.openPosition({ symbol: "FPT", side: "long", quantity, price, timestamp }).id;
}

describe("FIFO cost basis (S5)", () => {
	it("matches oldest lots first on partial close", () => {
		const pms = new PositionManager({ costBasisMethod: "fifo" });
		const id = open(pms, 100, 100, 1);
		open(pms, 100, 200, 2);
		const res = pms.closePosition(id, 150, 250, 3, undefined, { enforceAvailable: false });
		// Oldest 100 @100 fully + 50 @200: (250-100)*100 + (250-200)*50.
		expect(res.realizedPnl).toBe(150 * 100 + 50 * 50);
		expect(res.remaining?.quantity).toBe(50);
		// Remaining entry = weighted average of leftover lots (200).
		expect(res.remaining?.entryPrice).toBe(200);
	});

	it("full close conserves money vs average on identical fills (property)", () => {
		const fills: Array<{ quantity: number; price: number }> = [
			{ quantity: 100, price: 100 },
			{ quantity: 50, price: 120 },
			{ quantity: 200, price: 90 },
			{ quantity: 30, price: 150 },
		];
		const closes: Array<{ quantity: number; price: number }> = [
			{ quantity: 120, price: 130 },
			{ quantity: 260, price: 110 },
		];
		const run = (method: "average" | "fifo"): number => {
			const pms = new PositionManager({ costBasisMethod: method });
			let id = "";
			let t = 1;
			for (const f of fills) id = open(pms, f.quantity, f.price, t++);
			let total = 0;
			for (const c of closes) {
				total += pms.closePosition(id, c.quantity, c.price, t++, undefined, { enforceAvailable: false }).realizedPnl;
			}
			return total;
		};
		// Float dust from the average-path division is allowed (< 0.005đ).
		expect(run("fifo")).toBeCloseTo(run("average"), 2);
	});

	it("fuzz: full close always conserves money across random ledgers", () => {
		let seed = 42;
		const rand = () => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed / 2147483648;
		};
		for (let trial = 0; trial < 200; trial++) {
			const fills: Array<{ quantity: number; price: number }> = [];
			let totalQty = 0;
			const nFills = 1 + Math.floor(rand() * 5);
			for (let i = 0; i < nFills; i++) {
				const q = 10 + Math.floor(rand() * 200);
				fills.push({ quantity: q, price: 50 + Math.floor(rand() * 200) });
				totalQty += q;
			}
			// Close everything in 1-3 chunks at random prices.
			const closes: Array<{ quantity: number; price: number }> = [];
			let left = totalQty;
			while (left > 0) {
				const q = left <= 50 || rand() < 0.4 ? left : 10 + Math.floor(rand() * (left - 10));
				closes.push({ quantity: q, price: 50 + Math.floor(rand() * 200) });
				left -= q;
			}
			const run = (method: "average" | "fifo"): number => {
				const pms = new PositionManager({ costBasisMethod: method });
				let id = "";
				let t = 1;
				for (const f of fills) id = open(pms, f.quantity, f.price, t++);
				let total = 0;
				for (const c of closes) {
					total += pms.closePosition(id, c.quantity, c.price, t++, undefined, { enforceAvailable: false }).realizedPnl;
				}
				expect(pms.listPositions()).toHaveLength(0);
				return total;
			};
			expect(run("fifo")).toBeCloseTo(run("average"), 2);
		}
	});

	it("method switch is prospective: old average positions stay average", () => {
		const pms = new PositionManager({ costBasisMethod: "average" });
		const id = open(pms, 100, 100, 1);
		pms.setCostBasisMethod("fifo");
		open(pms, 100, 200, 2);
		// Position predates fifo tracking → average math on the blended entry.
		const res = pms.closePosition(id, 100, 250, 3, undefined, { enforceAvailable: false });
		expect(res.realizedPnl).toBe((250 - 150) * 100);
	});
});
