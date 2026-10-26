import { GridLayout, LayoutPreset, SlotConfig } from "./types";
import type { ChartLayout } from "@vninvestcharts/engine-react";

// ============================================
// Symmetric Presets (converted to new format)
// ============================================

const createSymmetricLayout = (rows: number, cols: number, id: string, name: string, nameKey: string): LayoutPreset => {
	const slots: SlotConfig[] = [];
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			slots.push({
				id: `chart-${r * cols + c + 1}`,
				rowStart: r + 1,
				rowEnd: r + 1,
				colStart: c + 1,
				colEnd: c + 1,
				areaName: `chart-${r * cols + c + 1}`,
			});
		}
	}

	const templateAreas = Array(rows).fill(null).map((_, r) =>
		Array(cols).fill(null).map((_, c) => `chart-${r * cols + c + 1}`).join(" ")
	);

	return {
		id,
		name,
		nameKey,
		layout: {
			rows,
			cols,
			slots,
			rowSizes: Array(rows).fill("1fr"),
			colSizes: Array(cols).fill("1fr"),
			templateAreas,
			areas: slots.reduce((acc, slot) => {
				acc[slot.areaName!] = slot;
				return acc;
			}, {} as Record<string, SlotConfig>),
		},
		category: "symmetric",
	};
};

// ============================================
// Asymmetric Presets
// ============================================

// L-Shape: Large main chart on left, 2 small charts stacked on right
export const L_SHAPE_PRESET: LayoutPreset = {
	id: "l-shape",
	name: "L-Shape",
	nameKey: "presets.lShape",
	layout: {
		rows: 2,
		cols: 2,
		slots: [
			{ id: "chart-1", rowStart: 1, rowEnd: 3, colStart: 1, colEnd: 2, areaName: "main", zIndex: 1 },
			{ id: "chart-2", rowStart: 1, rowEnd: 2, colStart: 2, colEnd: 3, areaName: "top-right", zIndex: 1 },
			{ id: "chart-3", rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3, areaName: "bottom-right", zIndex: 1 },
		],
		rowSizes: ["1fr", "1fr"],
		colSizes: ["2fr", "1fr"],
		templateAreas: [
			"main top-right",
			"main bottom-right",
		],
		areas: {
			main: { id: "chart-1", rowStart: 1, rowEnd: 3, colStart: 1, colEnd: 2, areaName: "main", zIndex: 1 },
			"top-right": { id: "chart-2", rowStart: 1, rowEnd: 2, colStart: 2, colEnd: 3, areaName: "top-right", zIndex: 1 },
			"bottom-right": { id: "chart-3", rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3, areaName: "bottom-right", zIndex: 1 },
		},
	},
	description: "Large main chart with two stacked charts on the side",
	descriptionKey: "presets.lShapeDesc",
	category: "asymmetric",
};

// T-Shape: Large chart on top, 3 small charts below
export const T_SHAPE_PRESET: LayoutPreset = {
	id: "t-shape",
	name: "T-Shape",
	nameKey: "presets.tShape",
	layout: {
		rows: 2,
		cols: 3,
		slots: [
			{ id: "chart-1", rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 4, areaName: "main", zIndex: 1 },
			{ id: "chart-2", rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2, areaName: "bottom-left", zIndex: 1 },
			{ id: "chart-3", rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3, areaName: "bottom-center", zIndex: 1 },
			{ id: "chart-4", rowStart: 2, rowEnd: 3, colStart: 3, colEnd: 4, areaName: "bottom-right", zIndex: 1 },
		],
		rowSizes: ["2fr", "1fr"],
		colSizes: ["1fr", "1fr", "1fr"],
		templateAreas: [
			"main main main",
			"bottom-left bottom-center bottom-right",
		],
		areas: {
			main: { id: "chart-1", rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 4, areaName: "main", zIndex: 1 },
			"bottom-left": { id: "chart-2", rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2, areaName: "bottom-left", zIndex: 1 },
			"bottom-center": { id: "chart-3", rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3, areaName: "bottom-center", zIndex: 1 },
			"bottom-right": { id: "chart-4", rowStart: 2, rowEnd: 3, colStart: 3, colEnd: 4, areaName: "bottom-right", zIndex: 1 },
		},
	},
	description: "Wide main chart with three charts below",
	descriptionKey: "presets.tShapeDesc",
	category: "asymmetric",
};

// Main + 3 Sidebar: Large main chart, 3 small charts in sidebar
export const MAIN_3_SIDEBAR_PRESET: LayoutPreset = {
	id: "main-3-sidebar",
	name: "Main + 3 Sidebar",
	nameKey: "presets.main3Sidebar",
	layout: {
		rows: 3,
		cols: 2,
		slots: [
			{ id: "chart-1", rowStart: 1, rowEnd: 4, colStart: 1, colEnd: 2, areaName: "main", zIndex: 1 },
			{ id: "chart-2", rowStart: 1, rowEnd: 2, colStart: 2, colEnd: 3, areaName: "sidebar-1", zIndex: 1 },
			{ id: "chart-3", rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3, areaName: "sidebar-2", zIndex: 1 },
			{ id: "chart-4", rowStart: 3, rowEnd: 4, colStart: 2, colEnd: 3, areaName: "sidebar-3", zIndex: 1 },
		],
		rowSizes: ["1fr", "1fr", "1fr"],
		colSizes: ["3fr", "1fr"],
		templateAreas: [
			"main sidebar-1",
			"main sidebar-2",
			"main sidebar-3",
		],
		areas: {
			main: { id: "chart-1", rowStart: 1, rowEnd: 4, colStart: 1, colEnd: 2, areaName: "main", zIndex: 1 },
			"sidebar-1": { id: "chart-2", rowStart: 1, rowEnd: 2, colStart: 2, colEnd: 3, areaName: "sidebar-1", zIndex: 1 },
			"sidebar-2": { id: "chart-3", rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3, areaName: "sidebar-2", zIndex: 1 },
			"sidebar-3": { id: "chart-4", rowStart: 3, rowEnd: 4, colStart: 2, colEnd: 3, areaName: "sidebar-3", zIndex: 1 },
		},
	},
	description: "Tall main chart with three sidebar charts",
	descriptionKey: "presets.main3SidebarDesc",
	category: "asymmetric",
};

// Quad + Focus: 2x2 grid with one chart expanded
export const QUAD_FOCUS_PRESET: LayoutPreset = {
	id: "quad-focus",
	name: "Quad + Focus",
	nameKey: "presets.quadFocus",
	layout: {
		rows: 3,
		cols: 3,
		slots: [
			{ id: "chart-1", rowStart: 1, rowEnd: 3, colStart: 1, colEnd: 3, areaName: "focus", zIndex: 2 },
			{ id: "chart-2", rowStart: 1, rowEnd: 2, colStart: 3, colEnd: 4, areaName: "top-right", zIndex: 1 },
			{ id: "chart-3", rowStart: 2, rowEnd: 3, colStart: 3, colEnd: 4, areaName: "middle-right", zIndex: 1 },
			{ id: "chart-4", rowStart: 3, rowEnd: 4, colStart: 1, colEnd: 2, areaName: "bottom-left", zIndex: 1 },
			{ id: "chart-5", rowStart: 3, rowEnd: 4, colStart: 2, colEnd: 3, areaName: "bottom-center", zIndex: 1 },
		],
		rowSizes: ["1fr", "1fr", "1fr"],
		colSizes: ["1fr", "1fr", "1fr"],
		templateAreas: [
			"focus focus top-right",
			"focus focus middle-right",
			"bottom-left bottom-center .",
		],
		areas: {
			focus: { id: "chart-1", rowStart: 1, rowEnd: 3, colStart: 1, colEnd: 3, areaName: "focus", zIndex: 2 },
			"top-right": { id: "chart-2", rowStart: 1, rowEnd: 2, colStart: 3, colEnd: 4, areaName: "top-right", zIndex: 1 },
			"middle-right": { id: "chart-3", rowStart: 2, rowEnd: 3, colStart: 3, colEnd: 4, areaName: "middle-right", zIndex: 1 },
			"bottom-left": { id: "chart-4", rowStart: 3, rowEnd: 4, colStart: 1, colEnd: 2, areaName: "bottom-left", zIndex: 1 },
			"bottom-center": { id: "chart-5", rowStart: 3, rowEnd: 4, colStart: 2, colEnd: 3, areaName: "bottom-center", zIndex: 1 },
		},
	},
	description: "Large focus chart with four smaller charts around it",
	descriptionKey: "presets.quadFocusDesc",
	category: "focus",
};

// ============================================
// All Presets Export
// ============================================

export const SYMMETRIC_PRESETS: LayoutPreset[] = [
	createSymmetricLayout(1, 1, "1x1", "1x1", "presets.1x1"),
	createSymmetricLayout(1, 2, "1x2", "1x2", "presets.1x2"),
	createSymmetricLayout(2, 1, "2x1", "2x1", "presets.2x1"),
	createSymmetricLayout(1, 3, "1x3", "1x3", "presets.1x3"),
	createSymmetricLayout(3, 1, "3x1", "3x1", "presets.3x1"),
	createSymmetricLayout(2, 2, "2x2", "2x2", "presets.2x2"),
	createSymmetricLayout(1, 4, "1x4", "1x4", "presets.1x4"),
	createSymmetricLayout(4, 1, "4x1", "4x1", "presets.4x1"),
	createSymmetricLayout(2, 3, "2x3", "2x3", "presets.2x3"),
	createSymmetricLayout(3, 2, "3x2", "3x2", "presets.3x2"),
	createSymmetricLayout(2, 4, "2x4", "2x4", "presets.2x4"),
	createSymmetricLayout(3, 3, "3x3", "3x3", "presets.3x3"),
];

export const ASYMMETRIC_PRESETS: LayoutPreset[] = [
	L_SHAPE_PRESET,
	T_SHAPE_PRESET,
	MAIN_3_SIDEBAR_PRESET,
	QUAD_FOCUS_PRESET,
];

// Custom preset placeholder for user-defined layouts
export const CUSTOM_PRESET: LayoutPreset = {
	id: "custom",
	name: "Custom",
	nameKey: "presets.custom",
	layout: {
		rows: 2,
		cols: 2,
		slots: [
			{ id: "chart-1", rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2, areaName: "chart-1", zIndex: 1 },
			{ id: "chart-2", rowStart: 1, rowEnd: 2, colStart: 2, colEnd: 3, areaName: "chart-2", zIndex: 1 },
			{ id: "chart-3", rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2, areaName: "chart-3", zIndex: 1 },
			{ id: "chart-4", rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3, areaName: "chart-4", zIndex: 1 },
		],
		rowSizes: ["1fr", "1fr"],
		colSizes: ["1fr", "1fr"],
		templateAreas: ["chart-1 chart-2", "chart-3 chart-4"],
		areas: {
			"chart-1": { id: "chart-1", rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2, areaName: "chart-1", zIndex: 1 },
			"chart-2": { id: "chart-2", rowStart: 1, rowEnd: 2, colStart: 2, colEnd: 3, areaName: "chart-2", zIndex: 1 },
			"chart-3": { id: "chart-3", rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2, areaName: "chart-3", zIndex: 1 },
			"chart-4": { id: "chart-4", rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3, areaName: "chart-4", zIndex: 1 },
		},
	},
	description: "User-defined custom layout",
	descriptionKey: "presets.customDesc",
	category: "custom" as const,
};

export const ALL_PRESETS: LayoutPreset[] = [
	...SYMMETRIC_PRESETS,
	...ASYMMETRIC_PRESETS,
	CUSTOM_PRESET,
];

export const PRESETS_BY_CATEGORY = {
	symmetric: SYMMETRIC_PRESETS,
	asymmetric: ASYMMETRIC_PRESETS.filter(p => p.category === "asymmetric"),
	focus: ASYMMETRIC_PRESETS.filter(p => p.category === "focus"),
	custom: [CUSTOM_PRESET],
};

export function findMatchingPreset(layout: ChartLayout): LayoutPreset {
	if (!layout) return ALL_PRESETS[0];

	// First, try matching based on templateAreas for asymmetric layouts
	if (layout.templateAreas && layout.templateAreas.length > 0) {
		const matched = ALL_PRESETS.find(p =>
			p.layout.rows === layout.rows &&
			p.layout.cols === layout.cols &&
			p.layout.templateAreas &&
			JSON.stringify(p.layout.templateAreas) === JSON.stringify(layout.templateAreas)
		);
		if (matched) return matched;
	}

	// Fallback to matching by rows & cols for symmetric presets
	const symmetricMatched = ALL_PRESETS.find(p =>
		p.layout.rows === layout.rows &&
		p.layout.cols === layout.cols &&
		p.category === "symmetric"
	);

	return symmetricMatched ?? ALL_PRESETS.find(p => p.id === `${layout.rows}x${layout.cols}`) ?? ALL_PRESETS[0];
}

export default ALL_PRESETS;