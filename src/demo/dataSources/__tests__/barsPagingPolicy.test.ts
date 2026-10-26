import { describe, expect, it } from "vitest";

import { buildBackwardPageRequest, normalizeBarsPagingMeta } from "../barsPagingPolicy";

const sampleBars = [
	{ date: new Date("2026-01-03T00:00:00.000Z"), open: 10, high: 12, low: 9, close: 11, volume: 100 },
	{ date: new Date("2026-01-02T00:00:00.000Z"), open: 9, high: 10, low: 8, close: 9.5, volume: 120 },
] as const;

describe("barsPagingPolicy", () => {
	it("uses explicit next_before when provided", () => {
		const meta = normalizeBarsPagingMeta(
			{ has_more_before: true, has_more_after: false, next_before: 1700000000000, snapshot_id: "snap-1" },
			sampleBars,
		);

		expect(meta).toEqual({
			hasMoreBefore: true,
			hasMoreAfter: false,
			nextBefore: 1700000000000,
			nextAfter: null,
			snapshotId: "snap-1",
		});
	});

	it("falls back to oldest bar timestamp when next_before is missing", () => {
		const meta = normalizeBarsPagingMeta(
			{ has_more_before: true, has_more_after: false, snapshot_id: "snap-2" },
			sampleBars,
		);

		expect(meta.hasMoreBefore).toBe(true);
		expect(meta.nextBefore).toBe(new Date("2026-01-02T00:00:00.000Z").valueOf());
	});

	it("disables nextBefore when has_more_before is false", () => {
		const meta = normalizeBarsPagingMeta(
			{ has_more_before: false, next_before: 1699999999999 },
			sampleBars,
		);

		expect(meta.hasMoreBefore).toBe(false);
		expect(meta.nextBefore).toBeNull();
	});

	it("builds backward page request from metadata cursor", () => {
		const request = buildBackwardPageRequest(
			{ hasMoreBefore: true, hasMoreAfter: false, nextBefore: 1699999999000, nextAfter: null, snapshotId: "snap-3" },
			1700000000000,
			300,
		);

		expect(request).toEqual({
			before: 1699999999000,
			limit: 300,
			snapshotId: "snap-3",
		});
	});

	it("returns null request when paging is exhausted", () => {
		const request = buildBackwardPageRequest(
			{ hasMoreBefore: false, hasMoreAfter: false, nextBefore: null, nextAfter: null, snapshotId: null },
			1700000000000,
			300,
		);

		expect(request).toBeNull();
	});
});
