import { describe, expect, it } from "vitest";
import { filterDrawings, generateDrawingLabel, reorderDrawings } from "../DrawingListPanel";

const mockT = (key: string): string => {
	const map: Record<string, string> = {
		"tool.trendLine": "Trend Line",
		"tool.fibonacci": "Fibonacci",
		"tool.longPosition": "Long Position",
		"tool.rectangle": "Rectangle",
		"tool.hLine": "Horizontal Line",
		"tool.gannFan": "Gann Fan",
	};
	return map[key] ?? key;
};
import type { DrawingObject } from "@vninvestcharts/engine-drawing";

function makeDrawing(overrides: Partial<DrawingObject> = {}): DrawingObject {
	return {
		id: "d1",
		type: "trendLine",
		points: [],
		style: {} as DrawingObject["style"],
		visible: true,
		locked: false,
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_000,
		...overrides,
	};
}

describe("DT-8 – DrawingListPanel utilities", () => {
	describe("generateDrawingLabel", () => {
		it("DT8-T01: returns label when drawing has custom label", () => {
			const d = makeDrawing({ label: "Support zone" });
			expect(generateDrawingLabel(d)).toBe("Support zone");
		});

		it("DT8-T02: trims whitespace from label", () => {
			const d = makeDrawing({ label: "  SL line  " });
			expect(generateDrawingLabel(d)).toBe("SL line");
		});

		it("DT8-T03: falls back to tool label for trendLine", () => {
			const d = makeDrawing({ type: "trendLine", label: "" });
			expect(generateDrawingLabel(d, mockT)).toBe("Trend Line");
		});

		it("DT8-T04: falls back to tool label for fibonacci", () => {
			const d = makeDrawing({ type: "fibonacci", label: undefined });
			expect(generateDrawingLabel(d, mockT)).toBe("Fibonacci");
		});

		it("DT8-T05: falls back to tool label for longPosition", () => {
			const d = makeDrawing({ type: "longPosition" });
			expect(generateDrawingLabel(d, mockT)).toBe("Long Position");
		});

		it("DT8-T06: falls back to tool label for rectangle", () => {
			const d = makeDrawing({ type: "rectangle" });
			expect(generateDrawingLabel(d, mockT)).toBe("Rectangle");
		});

		it("DT8-T07: falls back to tool label for hLine", () => {
			const d = makeDrawing({ type: "hLine" });
			expect(generateDrawingLabel(d, mockT)).toBe("Horizontal Line");
		});

		it("DT8-T08: falls back to tool label for gannFan", () => {
			const d = makeDrawing({ type: "gannFan" });
			expect(generateDrawingLabel(d, mockT)).toBe("Gann Fan");
		});
	});

	describe("DT-10a – filterDrawings", () => {
		it("DT10a-T01: empty query returns all drawings", () => {
			const drawings = [
				makeDrawing({ type: "trendLine" }),
				makeDrawing({ type: "fibonacci" }),
			];
			expect(filterDrawings(drawings, "")).toHaveLength(2);
		});

		it("DT10a-T02: filters by tool label", () => {
			const drawings = [
				makeDrawing({ type: "trendLine" }),
				makeDrawing({ type: "fibonacci" }),
			];
			const result = filterDrawings(drawings, "fibonacci");
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe("fibonacci");
		});

		it("DT10a-T03: filters by custom label field", () => {
			const drawings = [
				makeDrawing({ type: "hLine", label: "Support zone" }),
				makeDrawing({ type: "hLine", label: "Resistance" }),
			];
			const result = filterDrawings(drawings, "support");
			expect(result).toHaveLength(1);
			expect(result[0].label).toBe("Support zone");
		});

		it("DT10a-T04: filter is case-insensitive", () => {
			const drawings = [
				makeDrawing({ type: "trendLine" }),
			];
			expect(filterDrawings(drawings, "TREND")).toHaveLength(1);
			expect(filterDrawings(drawings, "TRend")).toHaveLength(1);
			expect(filterDrawings(drawings, "nomatch")).toHaveLength(0);
		});
	});

	describe("DT-10b – reorderDrawings", () => {
		it("DT10b-T01: moves item from one index to another", () => {
			const a = makeDrawing({ type: "trendLine" });
			const b = makeDrawing({ type: "fibonacci" });
			const c = makeDrawing({ type: "hLine" });
			const result = reorderDrawings([a, b, c], a.id, c.id);
			expect(result.map((d: DrawingObject) => d.id)).toEqual([b.id, c.id, a.id]);
		});

		it("DT10b-T02: returns same reference when fromId equals toId", () => {
			const drawings = [makeDrawing({ type: "hLine" })];
			const result = reorderDrawings(drawings, drawings[0].id, drawings[0].id);
			expect(result).toBe(drawings);
		});

		it("DT10b-T03: returns same reference when id not found", () => {
			const drawings = [makeDrawing({ type: "hLine" })];
			const result = reorderDrawings(drawings, "x", "y");
			expect(result).toBe(drawings);
		});
	});
});
