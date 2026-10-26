import { describe, expect, it } from "vitest";

import {
	isSegmentCoalescedByInflight,
	parseInflightRequestKey,
	toInflightRequestKey,
} from "./requestCoalescing";

describe("requestCoalescing", () => {
	it("serializes and parses inflight request keys", () => {
		const key = toInflightRequestKey({ side: "right", from: 1000, to: 2000, reason: "not-fetched" });
		expect(key).toBe("right:1000:2000");
		expect(parseInflightRequestKey(key)).toEqual({ side: "right", from: 1000, to: 2000 });
	});

	it("returns null for invalid inflight keys", () => {
		expect(parseInflightRequestKey("bad")).toBeNull();
		expect(parseInflightRequestKey("left:a:2")).toBeNull();
		expect(parseInflightRequestKey("up:1:2")).toBeNull();
	});

	it("coalesces when an inflight range fully covers the new segment on the same side", () => {
		const segment = { side: "right" as const, from: 1200, to: 1800, reason: "not-fetched" as const };
		const inflightKeys = ["right:1000:2000"];
		expect(isSegmentCoalescedByInflight(segment, inflightKeys)).toBe(true);
	});

	it("does not coalesce for partial overlap", () => {
		const segment = { side: "right" as const, from: 1200, to: 2200, reason: "not-fetched" as const };
		const inflightKeys = ["right:1000:2000"];
		expect(isSegmentCoalescedByInflight(segment, inflightKeys)).toBe(false);
	});

	it("does not coalesce when side differs", () => {
		const segment = { side: "left" as const, from: 1200, to: 1800, reason: "not-fetched" as const };
		const inflightKeys = ["right:1000:2000"];
		expect(isSegmentCoalescedByInflight(segment, inflightKeys)).toBe(false);
	});

	it("does not blanket-coalesce left side unless range is fully covered", () => {
		const segment = { side: "left" as const, from: 500, to: 900, reason: "not-fetched" as const };
		const inflightKeys = ["left:600:900"];
		expect(isSegmentCoalescedByInflight(segment, inflightKeys)).toBe(false);
	});
});
