import { describe, it, expect } from "vitest";
import { resolveBackfillWorkerFlags, DEFAULT_BACKFILL_WORKER_FLAGS } from "./BackfillWorkerFlags";

describe("BackfillWorkerFlags", () => {
	it("returns defaults when no props or params provided", () => {
		const flags = resolveBackfillWorkerFlags();
		expect(flags).toEqual(DEFAULT_BACKFILL_WORKER_FLAGS);
		expect(flags.enableExternalBarsNormalizationWorker).toBe(true);
		expect(flags.enableCandlestickLodWorker).toBe(true);
	});

	it("respects props override for external bars worker", () => {
		const flags = resolveBackfillWorkerFlags({ enableExternalBarsNormalizationWorker: false });
		expect(flags.enableExternalBarsNormalizationWorker).toBe(false);
		expect(flags.enableCandlestickLodWorker).toBe(true);
	});

	it("respects props override for candlestick LOD worker", () => {
		const flags = resolveBackfillWorkerFlags({ enableCandlestickLodWorker: false });
		expect(flags.enableExternalBarsNormalizationWorker).toBe(true);
		expect(flags.enableCandlestickLodWorker).toBe(false);
	});

	it("respects both props overrides", () => {
		const flags = resolveBackfillWorkerFlags({
			enableExternalBarsNormalizationWorker: false,
			enableCandlestickLodWorker: false,
		});
		expect(flags.enableExternalBarsNormalizationWorker).toBe(false);
		expect(flags.enableCandlestickLodWorker).toBe(false);
	});

	it("respects URL params for disabling external bars worker", () => {
		const params = new URLSearchParams("disableExternalBarsWorker=1");
		const flags = resolveBackfillWorkerFlags(undefined, params);
		expect(flags.enableExternalBarsNormalizationWorker).toBe(false);
		expect(flags.enableCandlestickLodWorker).toBe(true);
	});

	it("respects URL params for disabling LOD worker", () => {
		const params = new URLSearchParams("disableLodWorker=1");
		const flags = resolveBackfillWorkerFlags(undefined, params);
		expect(flags.enableExternalBarsNormalizationWorker).toBe(true);
		expect(flags.enableCandlestickLodWorker).toBe(false);
	});

	it("respects both URL params", () => {
		const params = new URLSearchParams("disableExternalBarsWorker=1&disableLodWorker=1");
		const flags = resolveBackfillWorkerFlags(undefined, params);
		expect(flags.enableExternalBarsNormalizationWorker).toBe(false);
		expect(flags.enableCandlestickLodWorker).toBe(false);
	});

	it("props override URL params", () => {
		const params = new URLSearchParams("disableExternalBarsWorker=1");
		const flags = resolveBackfillWorkerFlags({ enableExternalBarsNormalizationWorker: true }, params);
		expect(flags.enableExternalBarsNormalizationWorker).toBe(true);
	});
});
