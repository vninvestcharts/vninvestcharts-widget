import { describe, expect, it } from "vitest";

import { buildHistorySessionRequestKey, buildSourceRevisionKey } from "./sessionGuards";
import type { SourceSemanticsDescriptor } from "../../lib/adapters";

function makeSemantics(overrides: Partial<SourceSemanticsDescriptor> = {}): SourceSemanticsDescriptor {
	return {
		sourceId: "vninvest",
		sourceContractVersion: "v1",
		instrumentClass: "equity",
		coverageMode: "exact-range",
		sessionModel: "exchange-calendar",
		sessionCalendarId: "vn-exchange-calendar",
		timezone: "Asia/Ho_Chi_Minh",
		supportsExactRangeFetch: true,
		supportsBackwardAnchor: false,
		supportsForwardAnchor: false,
		supportsLiveBars: true,
		finalityMode: "historically-correctable",
		correctionLookbackMs: 86400000,
		expectedGapReasons: ["not-fetched", "market-closed"],
		...overrides,
	};
}

describe("sessionGuards", () => {
	it("builds deterministic source revision key for the same semantics", () => {
		const semantics = makeSemantics();
		const first = buildSourceRevisionKey("adapter-a", semantics);
		const second = buildSourceRevisionKey("adapter-a", semantics);
		expect(first).toBe(second);
	});

	it("changes source revision key when source contract version changes", () => {
		const current = buildSourceRevisionKey("adapter-a", makeSemantics({ sourceContractVersion: "v1" }));
		const next = buildSourceRevisionKey("adapter-a", makeSemantics({ sourceContractVersion: "v2" }));
		expect(next).not.toBe(current);
	});

	it("changes source revision key when finality semantics change", () => {
		const current = buildSourceRevisionKey("adapter-a", makeSemantics({ finalityMode: "immutable" }));
		const next = buildSourceRevisionKey("adapter-a", makeSemantics({ finalityMode: "near-now-provisional" }));
		expect(next).not.toBe(current);
	});

	it("changes source revision key when timezone changes", () => {
		const current = buildSourceRevisionKey("adapter-a", makeSemantics({ timezone: "UTC" }));
		const next = buildSourceRevisionKey("adapter-a", makeSemantics({ timezone: "Asia/Ho_Chi_Minh" }));
		expect(next).not.toBe(current);
	});

	it("uses fallback key when semantics are missing", () => {
		expect(buildSourceRevisionKey("adapter-a", null)).toBe("adapter-a|no-semantics");
	});

	it("builds history request key using source revision key", () => {
		const sourceRevisionKey = buildSourceRevisionKey("adapter-a", makeSemantics());
		expect(buildHistorySessionRequestKey("VNINDEX", "1m", sourceRevisionKey)).toContain(sourceRevisionKey);
	});
});
