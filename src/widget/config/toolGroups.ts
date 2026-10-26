/**
 * Tool group configuration for drawing toolbar inside the widget.
 * Covers 14 groups.
 * Each group has id (for tracking) and labelKey (for i18n lookup in tool.group.*).
 */

export interface ToolGroup {
	id: string;
	labelKey: string;  // i18n key e.g. "tool.group.cursor"
	tools: string[];   // DrawingToolType | "cursor" | "crosshair"
}

export const TOOL_GROUPS_V2: ToolGroup[] = [
	{
		id: "cursor",
		labelKey: "tool.group.cursor",
		tools: ["cursor", "crosshair"],
	},
	{
		id: "lines",
		labelKey: "tool.group.lines",
		tools: ["trendLine", "ray", "extendedLine", "hLine", "vLine", "polyline", "arrow", "flatTopBottom", "trendAngle", "infoLine"],
	},
	{
		id: "channels",
		labelKey: "tool.group.channels",
		// P4: pitchfork lives in its own group below (was duplicated here).
		tools: ["channel", "parallelChannel", "regressionChannel", "disjointChannel"],
	},
	{
		id: "fibonacci",
		labelKey: "tool.group.fibonacci",
		tools: [
			"fibonacci",
			"fibExtension",
			"fibArc",
			"fibTimeZone",
			"fibChannel",
			"fibSpeedResistanceFan",
			"trendBasedFibTime",
			"fibCircles",
			"fibSpiral",
			"fibSpeedResistanceArcs",
			"fibWedge",
			"pitchfan",
		],
	},
	{
		id: "gann",
		labelKey: "tool.group.gann",
		tools: ["gannFan", "gannBox", "gannSquare", "gannSquareFixed", "gannFixed"],
	},
	{
		id: "pitchfork",
		labelKey: "tool.group.pitchfork",
		tools: ["pitchfork", "schiffPitchfork", "modifiedSchiff", "insidePitchfork"],
	},
	{
		id: "shapes",
		labelKey: "tool.group.shapes",
		tools: ["rectangle", "circle", "ellipse", "triangle", "text", "callout", "priceLabel", "curve", "arc", "path", "polygon", "rotatedRectangle"],
	},
	{
		id: "annotation",
		labelKey: "tool.group.annotation",
		tools: ["brush", "highlighter", "eraser"],
	},
	{
		id: "measurement",
		labelKey: "tool.group.measurement",
		tools: ["dateAndPriceRange", "longPosition", "shortPosition", "priceRange", "dateRange", "barsCount", "crossLine", "datePriceRange"],
	},
	{
		id: "patterns",
		labelKey: "tool.group.patterns",
		tools: [
			"abcdPattern",
			"xabcdPattern",
			"cypherPattern",
			"headAndShoulders",
			"trianglePattern",
			"threeDrivesPattern",
			"ghostFeed",
			"barsPattern",
		],
	},
	{
		id: "elliott",
		labelKey: "tool.group.elliott",
		tools: [
			"elliottImpulse",
			"elliottCorrection",
			"elliottTriangle",
			"elliottDoubleCombo",
			"elliottTripleCombo",
		],
	},
	{
		id: "cycles",
		labelKey: "tool.group.cycles",
		tools: ["cyclicLines", "timeCycles", "sineLine"],
	},
	{
		id: "orderflow",
		labelKey: "tool.group.orderflow",
		tools: ["anchoredVwap"],
	},
	{
		id: "icons",
		labelKey: "tool.group.icons",
		tools: ["iconMarker"],
	},
];
