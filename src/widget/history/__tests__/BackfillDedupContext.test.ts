import { describe, it, expect, vi } from "vitest";
import {
	withBackfillDedup,
	dedupWrapAdapter,
	type BackfillDedupValue,
} from "../BackfillDedupContext";
import type { StockDataAdapter } from "../../../lib/types/adapter";

function makeCtx(): BackfillDedupValue {
	const map = new Map<string, Promise<readonly any[]>>();
	return {
		register: (k, p) => {
			map.set(k, p);
			p.finally(() => {
				if (map.get(k) === p) map.delete(k);
			});
		},
		get: (k) => map.get(k),
	};
}

describe("withBackfillDedup", () => {
	it("shares one call for the same key (cross-chart dedup)", async () => {
		const ctx = makeCtx();
		const fn = vi.fn(async () => [{ id: 1 }]);
		const p1 = withBackfillDedup(ctx, "k", fn);
		const p2 = withBackfillDedup(ctx, "k", fn);
		const [a, b] = await Promise.all([p1, p2]);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(a).toEqual(b);
	});

	it("no dedup when ctx is null (SingleChart standalone)", async () => {
		const fn = vi.fn(async () => [{ id: 1 }]);
		await withBackfillDedup(null, "k", fn);
		await withBackfillDedup(null, "k", fn);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("different keys do not share", async () => {
		const ctx = makeCtx();
		const fn = vi.fn(async () => [{ id: 1 }]);
		await Promise.all([withBackfillDedup(ctx, "k1", fn), withBackfillDedup(ctx, "k2", fn)]);
		expect(fn).toHaveBeenCalledTimes(2);
	});
});

describe("dedupWrapAdapter", () => {
	it("dedupes fetchBarsBefore across two charts (1 network call)", async () => {
		const ctx = makeCtx();
		const fetchBarsBefore = vi.fn(async () => [{ id: 1 }]);
		const adapter = { fetchBarsBefore } as unknown as StockDataAdapter;
		const wrapped = dedupWrapAdapter(adapter, ctx);

		const p1 = (wrapped as any).fetchBarsBefore("BTC", "1h", new Date(1000), 500, "chartA");
		const p2 = (wrapped as any).fetchBarsBefore("BTC", "1h", new Date(1000), 500, "chartB");
		await Promise.all([p1, p2]);
		// chartId differs but key excludes chartId → same range → 1 call.
		// INVARIANT: this is correct ONLY if the adapter returns identical data
		// for the same range regardless of chartId.
		expect(fetchBarsBefore).toHaveBeenCalledTimes(1);
	});

	it("does NOT dedup when no ctx (falls back to raw adapter)", async () => {
		const fetchBarsBefore = vi.fn(async () => [{ id: 1 }]);
		const adapter = { fetchBarsBefore } as unknown as StockDataAdapter;
		const wrapped = dedupWrapAdapter(adapter, null as any);
		await (wrapped as any).fetchBarsBefore("BTC", "1h", new Date(1000), 500, "a");
		await (wrapped as any).fetchBarsBefore("BTC", "1h", new Date(1000), 500, "b");
		expect(fetchBarsBefore).toHaveBeenCalledTimes(2);
	});

	it("dedupes fetchBarsInRange by from/to", async () => {
		const ctx = makeCtx();
		const fetchBarsInRange = vi.fn(async () => [{ id: 1 }]);
		const adapter = { fetchBarsInRange } as unknown as StockDataAdapter;
		const wrapped = dedupWrapAdapter(adapter, ctx);
		const p1 = (wrapped as any).fetchBarsInRange("BTC", "1h", new Date(0), new Date(1000), "a");
		const p2 = (wrapped as any).fetchBarsInRange("BTC", "1h", new Date(0), new Date(1000), "b");
		await Promise.all([p1, p2]);
		expect(fetchBarsInRange).toHaveBeenCalledTimes(1);
	});
});
