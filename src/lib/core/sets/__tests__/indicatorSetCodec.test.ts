import { describe, expect, it } from "vitest";
import { BUILTIN_INDICATOR_SETS } from "../builtins";
import {
	buildIndicatorSetFileName,
	createIndicatorSet,
	indicatorSetToPaneLayout,
	loadIndicatorSets,
	sanitizeIndicatorSet,
	sanitizeIndicatorSetsStorage,
	saveIndicatorSets,
	stringifyIndicatorSet,
} from "../indicatorSetCodec";
import type { PaneDescriptor } from "../../types/pane-descriptor";

function createMockStorage(initialValue: string | null = null) {
	let value = initialValue;
	return {
		getItem: () => value,
		setItem: (_key: string, nextValue: string) => {
			value = nextValue;
		},
		removeItem: () => {
			value = null;
		},
		get value() {
			return value;
		},
	};
}

const samplePane: PaneDescriptor = {
	id: "price",
	label: "Price",
	pinned: true,
	visible: true,
	heightRatio: 1,
	series: [{ type: "Candlestick", yAxis: "right" }],
	splitScale: false,
	tooltip: "ohlc",
};

describe("indicatorSetCodec", () => {
	it("creates a cloned indicator set from panes", () => {
		const next = createIndicatorSet("Swing", [samplePane], 1234);
		expect(next.name).toBe("Swing");
		expect(next.createdAt).toBe(1234);
		expect(next.panes).toHaveLength(1);
		expect(next.panes[0]).not.toBe(samplePane);
	});

	it("sanitizes and clones imported sets", () => {
		const next = sanitizeIndicatorSet({
			id: "set-1",
			name: "Imported",
			createdAt: 10,
			updatedAt: 20,
			panes: [samplePane],
			isBuiltin: true,
		});
		expect(next?.id).toBe("set-1");
		expect(next?.isBuiltin).toBe(false);
		expect(next?.panes[0]).not.toBe(samplePane);
	});

	it("rejects malformed sets", () => {
		expect(sanitizeIndicatorSet({})).toBeNull();
		expect(sanitizeIndicatorSetsStorage({ version: 2, sets: [] })).toBeNull();
	});

	it("saves and loads user sets from storage", () => {
		const storage = createMockStorage();
		const savedSet = createIndicatorSet("Saved", [samplePane], 1000);
		saveIndicatorSets(storage, [savedSet]);

		const payload = JSON.parse(storage.value ?? "null") as { version?: number; sets?: unknown[] } | null;
		expect(payload?.version).toBe(1);
		expect(payload?.sets).toHaveLength(1);

		const loaded = loadIndicatorSets(storage);
		expect(loaded).toHaveLength(1);
		expect(loaded[0]?.name).toBe("Saved");
	});

	it("returns empty sets for corrupt storage", () => {
		const storage = createMockStorage("{{invalid json}}");
		expect(loadIndicatorSets(storage)).toEqual([]);
	});

	it("clones pane layouts for application and export naming", () => {
		const set = createIndicatorSet("Crypto Standard", [samplePane], 1710000000000);
		const layout = indicatorSetToPaneLayout(set);
		expect(layout).toHaveLength(1);
		expect(layout[0]).not.toBe(samplePane);
		expect(buildIndicatorSetFileName(set.name, set.createdAt)).toMatch(/\.vnsc-set$/);
	});

	it("round-trips exported indicator set JSON", () => {
		const original = createIndicatorSet("Round Trip", [samplePane], 1710000000000);
		const exported = stringifyIndicatorSet(original);
		const imported = sanitizeIndicatorSet(JSON.parse(exported));
		expect(imported?.id).toBe(original.id);
		expect(imported?.name).toBe(original.name);
		expect(imported?.panes).toHaveLength(1);
	});

	it("ships four built-in templates", () => {
		expect(BUILTIN_INDICATOR_SETS).toHaveLength(4);
		expect(BUILTIN_INDICATOR_SETS.every((set) => set.isBuiltin)).toBe(true);
		expect(BUILTIN_INDICATOR_SETS.map((set) => set.id)).toContain("builtin-ema-multi");
	});
});