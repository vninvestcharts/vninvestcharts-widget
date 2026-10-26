import { describe, expect, it } from "vitest";
import { WorkspaceSerializer } from "../WorkspaceSerializer";

describe("WorkspaceSerializer round-trip (BL-17)", () => {
	const panes = [{ id: "price", series: [{ type: "Candles" }] }] as never;
	const drawings = [{ id: "d1", type: "trendLine", points: [{ x: 1, y: 2 }] }] as never;
	const settings = { theme: "dark", symbol: "VIC", maxVisiblePanes: 2 } as never;

	it("round-trips panes, drawings and settings", () => {
		const json = WorkspaceSerializer.serialize(panes, drawings, settings);
		const back = WorkspaceSerializer.deserialize(json);
		expect(back).not.toBeNull();
		expect(back?.version).toBe(1);
		expect(back?.panes).toEqual(panes);
		expect(back?.drawings).toEqual(drawings);
		expect(back?.settings).toMatchObject({ theme: "dark", symbol: "VIC" });
		expect(typeof back?.timestamp).toBe("number");
	});

	it("rejects malformed JSON", () => {
		expect(WorkspaceSerializer.deserialize("not-json{{{")).toBeNull();
		expect(WorkspaceSerializer.deserialize("")).toBeNull();
		expect(WorkspaceSerializer.deserialize("42")).toBeNull();
		expect(WorkspaceSerializer.deserialize("null")).toBeNull();
	});

	it("rejects future schema versions", () => {
		expect(WorkspaceSerializer.deserialize(JSON.stringify({ version: 999, panes: [], drawings: [], settings: {} }))).toBeNull();
	});

	it("normalizes missing arrays/settings to safe defaults", () => {
		const back = WorkspaceSerializer.deserialize(JSON.stringify({ version: 1 }));
		expect(back?.panes).toEqual([]);
		expect(back?.drawings).toEqual([]);
		expect(back?.settings).toEqual({});
	});
});
