/**
 * TEST-1 (Phase 1): Asymmetric save/load invariant lock.
 *
 * Baseline: docs/upgrade-standard/audits/COMPREHENSIVE_SYSTEM_AUDIT_2026-09-14.md
 * (CORR entry — GAP-ASYM-SAVE logic already fixed at commit 35c4f2c).
 * This suite proves it stays fixed: GridLayout -> ChartLayout -> GridLayout
 * roundtrips must preserve asymmetric geometry (spanning slots +
 * templateAreas) for every preset, and WorkspaceManager.save/load must
 * preserve the layout JSON byte-for-byte (modulo serialization).
 *
 * NOTE: `areas` is intentionally NOT asserted deep-equal — the
 * ChartLayout wire form keeps only { chartId, zIndex } per area, so
 * row/col geometry inside `areas` is lossy by design. Slots carry geometry.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
	chartLayoutToGridLayout,
	gridLayoutToChartLayout,
	type MultiChartConfig,
} from "../VNInvestMultiCharts";
import {
	ALL_PRESETS,
	ASYMMETRIC_PRESETS,
	findMatchingPreset,
} from "../grid/presets";
import type { GridLayout } from "../grid/types";
import { WorkspaceManager } from "../workspace/WorkspaceManager";
import type { WorkspaceData } from "../workspace/types";

function makeCharts(layout: GridLayout): MultiChartConfig[] {
	return layout.slots.map((s, i) => ({
		id: s.id,
		symbol: `SYM${i + 1}`,
		timeframe: "1D",
	}));
}

function expectGeometryEqual(actual: GridLayout, expected: GridLayout) {
	expect(actual.rows).toBe(expected.rows);
	expect(actual.cols).toBe(expected.cols);
	expect(actual.templateAreas).toEqual(expected.templateAreas);
	expect(actual.rowSizes).toEqual(expected.rowSizes);
	expect(actual.colSizes).toEqual(expected.colSizes);
	expect(actual.slots.map((s) => ({
		id: s.id,
		rowStart: s.rowStart,
		rowEnd: s.rowEnd,
		colStart: s.colStart,
		colEnd: s.colEnd,
		areaName: s.areaName,
	}))).toEqual(expected.slots.map((s) => ({
		id: s.id,
		rowStart: s.rowStart,
		rowEnd: s.rowEnd,
		colStart: s.colStart,
		colEnd: s.colEnd,
		areaName: s.areaName,
	})));
}

describe("TEST-1 asymmetric save/load invariant", () => {
	it("covers at least the 4 known asymmetric presets (guard against preset deletion)", () => {
		const ids = ASYMMETRIC_PRESETS.map((p) => p.id);
		expect(ids).toEqual(
			expect.arrayContaining(["l-shape", "t-shape", "main-3-sidebar", "quad-focus"]),
		);
	});

	it.each(ALL_PRESETS.map((p) => [p.id, p.layout] as const))(
		"roundtrip preserves geometry for preset %s",
		(_id, layout) => {
			const charts = makeCharts(layout);
			const chartLayout = gridLayoutToChartLayout(layout);
			// slots must survive the ChartLayout wire form (regression: (layout as any).slots)
			expect(chartLayout.slots).toBeDefined();
			expect(chartLayout.slots).toHaveLength(layout.slots.length);
			const restored = chartLayoutToGridLayout(chartLayout, charts);
			expectGeometryEqual(restored, layout);
		},
	);

	it("asymmetric presets keep at least one spanning slot after roundtrip (anti-flatten)", () => {
		for (const preset of ASYMMETRIC_PRESETS) {
			const restored = chartLayoutToGridLayout(
				gridLayoutToChartLayout(preset.layout),
				makeCharts(preset.layout),
			);
			const spanning = restored.slots.filter(
				(s) => s.rowEnd > s.rowStart || s.colEnd > s.colStart,
			);
			expect(
				spanning.length,
				`${preset.id} lost all spanning slots (flattened to symmetric)`,
			).toBeGreaterThan(0);
		}
	});

	it("legacy {rows, cols} without slots falls back to symmetric slots (backward compat)", () => {
		const restored = chartLayoutToGridLayout({ rows: 2, cols: 2 }, [
			{ id: "a", symbol: "AAA", timeframe: "1D" },
			{ id: "b", symbol: "BBB", timeframe: "1D" },
		]);
		expect(restored.slots).toHaveLength(4);
		expect(restored.slots[0]).toMatchObject({ rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 });
		expect(restored.slots[3]).toMatchObject({ rowStart: 2, rowEnd: 2, colStart: 2, colEnd: 2 });
	});

	it("findMatchingPreset resolves asymmetric chartLayouts back to their preset (no symmetric fallback)", () => {
		for (const preset of ASYMMETRIC_PRESETS) {
			const matched = findMatchingPreset(gridLayoutToChartLayout(preset.layout));
			expect(matched.id).toBe(preset.id);
		}
	});
});

describe("TEST-1 WorkspaceManager layout persistence", () => {
	let store: Record<string, string>;
	const storageAdapter: any = {
		getItem: (k: string) => store[k] ?? null,
		setItem: (k: string, v: string) => { store[k] = v; },
		removeItem: (k: string) => { delete store[k]; },
	};

	beforeEach(() => { store = {}; });

	it.each(ASYMMETRIC_PRESETS.map((p) => [p.id, p.layout] as const))(
		"save/load preserves layout JSON for %s",
		async (_id, layout) => {
			const charts = makeCharts(layout);
			const ws: WorkspaceData = {
				id: "ws-1",
				name: "ws-1",
				layout,
				charts: charts.map((c) => ({ id: c.id, symbol: c.symbol, timeframe: c.timeframe })),
				drawings: [],
				syncGroups: [],
				activeChartId: charts[0]?.id ?? null,
				createdAt: 1,
				updatedAt: 2,
				version: 3,
			};
			await WorkspaceManager.save(ws, storageAdapter);
			const loaded = await WorkspaceManager.load("ws-1", storageAdapter);
			expect(loaded).not.toBeNull();
			expectGeometryEqual(loaded!.layout, layout);
		},
	);
});
