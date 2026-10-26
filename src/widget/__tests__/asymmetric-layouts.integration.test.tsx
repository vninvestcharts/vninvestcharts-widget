import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GridLayout, SlotConfig, LayoutPreset } from "../grid/types";
import { ALL_PRESETS, L_SHAPE_PRESET, T_SHAPE_PRESET, MAIN_3_SIDEBAR_PRESET, QUAD_FOCUS_PRESET } from "../grid/presets";

// Mock VNInvestCharts
vi.mock("../VNInvestCharts", () => ({
	VNInvestCharts: vi.fn(({ symbol, timeframe, ...props }) => (
		<div data-testid="vninvest-charts" data-symbol={symbol} data-timeframe={timeframe} {...props} />
	)),
}));

// Mock adapters
const mockAdapters = {
	resizeAdapter: vi.fn(),
	keyboardAdapter: vi.fn(),
	clockAdapter: { now: () => Date.now(), requestFrame: (cb: FrameRequestCallback) => requestAnimationFrame(cb) },
	storageAdapter: {
		getItem: vi.fn(),
		setItem: vi.fn(),
		removeItem: vi.fn(),
	},
	portalAdapter: vi.fn(),
	registryAdapter: vi.fn(),
};

describe("Asymmetric Layouts Integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Preset Definitions", () => {
		it("should have all symmetric presets defined", () => {
			const symmetricPresets = ALL_PRESETS.filter(p => p.category === "symmetric");
			expect(symmetricPresets.length).toBeGreaterThanOrEqual(6);

			const presetIds = symmetricPresets.map(p => p.id);
			expect(presetIds).toContain("1x1");
			expect(presetIds).toContain("1x2");
			expect(presetIds).toContain("2x1");
			expect(presetIds).toContain("2x2");
			expect(presetIds).toContain("1x4");
			expect(presetIds).toContain("4x1");
		});

		it("should have all asymmetric presets defined", () => {
			const asymmetricPresets = ALL_PRESETS.filter(p => p.category === "asymmetric" || p.category === "focus");
			expect(asymmetricPresets.length).toBeGreaterThanOrEqual(4);

			const presetIds = asymmetricPresets.map(p => p.id);
			expect(presetIds).toContain("l-shape");
			expect(presetIds).toContain("t-shape");
			expect(presetIds).toContain("main-3-sidebar");
			expect(presetIds).toContain("quad-focus");
		});

		it("should have valid templateAreas for L-Shape preset", () => {
			expect(L_SHAPE_PRESET.layout.templateAreas).toEqual([
				"main top-right",
				"main bottom-right",
			]);
			expect(L_SHAPE_PRESET.layout.rowSizes).toEqual(["1fr", "1fr"]);
			expect(L_SHAPE_PRESET.layout.colSizes).toEqual(["2fr", "1fr"]);
		});

		it("should have valid templateAreas for T-Shape preset", () => {
			expect(T_SHAPE_PRESET.layout.templateAreas).toEqual([
				"main main main",
				"bottom-left bottom-center bottom-right",
			]);
			expect(T_SHAPE_PRESET.layout.rowSizes).toEqual(["2fr", "1fr"]);
			expect(T_SHAPE_PRESET.layout.colSizes).toEqual(["1fr", "1fr", "1fr"]);
		});

		it("should have valid templateAreas for Main+3Sidebar preset", () => {
			expect(MAIN_3_SIDEBAR_PRESET.layout.templateAreas).toEqual([
				"main sidebar-1",
				"main sidebar-2",
				"main sidebar-3",
			]);
			expect(MAIN_3_SIDEBAR_PRESET.layout.rowSizes).toEqual(["1fr", "1fr", "1fr"]);
			expect(MAIN_3_SIDEBAR_PRESET.layout.colSizes).toEqual(["3fr", "1fr"]);
		});

		it("should have valid templateAreas for Quad+Focus preset", () => {
			expect(QUAD_FOCUS_PRESET.layout.templateAreas).toEqual([
				"focus focus top-right",
				"focus focus middle-right",
				"bottom-left bottom-center .",
			]);
			expect(QUAD_FOCUS_PRESET.layout.rowSizes).toEqual(["1fr", "1fr", "1fr"]);
			expect(QUAD_FOCUS_PRESET.layout.colSizes).toEqual(["1fr", "1fr", "1fr"]);
		});
	});

	describe("GridLayout Type Validation", () => {
		it("should accept templateAreas in GridLayout", () => {
			const layout: GridLayout = {
				rows: 2,
				cols: 2,
				slots: [],
				rowSizes: ["1fr", "1fr"],
				colSizes: ["1fr", "1fr"],
				templateAreas: ["a b", "c d"],
				areas: {
					a: { id: "1", rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2, areaName: "a" },
					b: { id: "2", rowStart: 1, rowEnd: 2, colStart: 2, colEnd: 3, areaName: "b" },
					c: { id: "3", rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2, areaName: "c" },
					d: { id: "4", rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3, areaName: "d" },
				},
			};

			expect(layout.templateAreas).toBeDefined();
			expect(layout.areas).toBeDefined();
			expect(layout.templateAreas!.length).toBe(2);
		});

		it("should accept zIndex in SlotConfig", () => {
			const slot: SlotConfig = {
				id: "chart-1",
				rowStart: 1,
				rowEnd: 2,
				colStart: 1,
				colEnd: 2,
				areaName: "main",
				zIndex: 10,
			};

			expect(slot.zIndex).toBe(10);
			expect(slot.areaName).toBe("main");
		});
	});

	describe("LayoutPreset Type Validation", () => {
		it("should have required fields", () => {
			const preset: LayoutPreset = {
				id: "test-preset",
				name: "Test Preset",
				nameKey: "presets.test",
				layout: {
					rows: 1,
					cols: 1,
					slots: [],
					rowSizes: ["1fr"],
					colSizes: ["1fr"],
				},
				category: "symmetric",
			};

			expect(preset.id).toBe("test-preset");
			expect(preset.category).toBe("symmetric");
		});

		it("should accept optional fields", () => {
			const preset: LayoutPreset = {
				id: "test-preset",
				name: "Test Preset",
				nameKey: "presets.test",
				layout: {
					rows: 1,
					cols: 1,
					slots: [],
					rowSizes: ["1fr"],
					colSizes: ["1fr"],
				},
				description: "Test description",
				descriptionKey: "presets.testDesc",
				thumbnail: "thumbnail.png",
				category: "asymmetric",
			};

			expect(preset.description).toBe("Test description");
			expect(preset.thumbnail).toBe("thumbnail.png");
		});
	});

	describe("Preset Categories", () => {
		it("should categorize presets correctly", () => {
			const symmetric = ALL_PRESETS.filter(p => p.category === "symmetric");
			const asymmetric = ALL_PRESETS.filter(p => p.category === "asymmetric");
			const focus = ALL_PRESETS.filter(p => p.category === "focus");

			expect(symmetric.length).toBeGreaterThan(0);
			expect(asymmetric.length).toBeGreaterThan(0);
			expect(focus.length).toBeGreaterThan(0);
		});
	});
});

describe("GridContainer with Asymmetric Layouts", () => {
	it("should render L-Shape layout correctly", () => {
		// This would be a more complete integration test with actual GridContainer
		// For now, we validate the preset structure
		const layout = L_SHAPE_PRESET.layout;

		// Verify grid structure
		expect(layout.rows).toBe(2);
		expect(layout.cols).toBe(2);
		expect(layout.slots.length).toBe(3);

		// Verify main chart spans both rows
		const mainSlot = layout.slots.find(s => s.areaName === "main");
		expect(mainSlot).toBeDefined();
		expect(mainSlot!.rowStart).toBe(1);
		expect(mainSlot!.rowEnd).toBe(3);
		expect(mainSlot!.colStart).toBe(1);
		expect(mainSlot!.colEnd).toBe(2);
	});

	it("should render T-Shape layout correctly", () => {
		const layout = T_SHAPE_PRESET.layout;

		expect(layout.rows).toBe(2);
		expect(layout.cols).toBe(3);
		expect(layout.slots.length).toBe(4);

		// Verify main chart spans all columns
		const mainSlot = layout.slots.find(s => s.areaName === "main");
		expect(mainSlot).toBeDefined();
		expect(mainSlot!.rowStart).toBe(1);
		expect(mainSlot!.rowEnd).toBe(2);
		expect(mainSlot!.colStart).toBe(1);
		expect(mainSlot!.colEnd).toBe(4);
	});

	it("should render Main+3Sidebar layout correctly", () => {
		const layout = MAIN_3_SIDEBAR_PRESET.layout;

		expect(layout.rows).toBe(3);
		expect(layout.cols).toBe(2);
		expect(layout.slots.length).toBe(4);

		// Verify main chart spans all rows
		const mainSlot = layout.slots.find(s => s.areaName === "main");
		expect(mainSlot).toBeDefined();
		expect(mainSlot!.rowStart).toBe(1);
		expect(mainSlot!.rowEnd).toBe(4);
		expect(mainSlot!.colStart).toBe(1);
		expect(mainSlot!.colEnd).toBe(2);
	});

	it("should render Quad+Focus layout correctly", () => {
		const layout = QUAD_FOCUS_PRESET.layout;

		expect(layout.rows).toBe(3);
		expect(layout.cols).toBe(3);
		expect(layout.slots.length).toBe(5);

		// Verify focus chart spans 2x2
		const focusSlot = layout.slots.find(s => s.areaName === "focus");
		expect(focusSlot).toBeDefined();
		expect(focusSlot!.rowStart).toBe(1);
		expect(focusSlot!.rowEnd).toBe(3);
		expect(focusSlot!.colStart).toBe(1);
		expect(focusSlot!.colEnd).toBe(3);
		expect(focusSlot!.zIndex).toBe(2); // Higher z-index for focus
	});
});

describe("LayoutDesigner Integration", () => {
	it("should have all required preset categories", () => {
		const categories = ["symmetric", "asymmetric", "focus", "custom"];
		const presetCategories = ALL_PRESETS.map(p => p.category).filter((v, i, a) => a.indexOf(v) === i);

		categories.forEach(cat => {
			expect(presetCategories).toContain(cat);
		});
	});

	it("should have i18n keys for all presets", () => {
		ALL_PRESETS.forEach(preset => {
			expect(preset.nameKey).toBeDefined();
			if (preset.descriptionKey) {
				expect(preset.descriptionKey).toBeDefined();
			}
		});
	});
});