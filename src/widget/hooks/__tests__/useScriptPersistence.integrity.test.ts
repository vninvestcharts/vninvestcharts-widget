import { describe, expect, it } from "vitest";
import { scriptChecksum, isScriptIntact, findAlteredScripts } from "../useScriptPersistence";
import type { ScriptData } from "../useScriptPersistence";

/**
 * A25, the honest half.
 *
 * The plan asks for HMAC signing keyed off the license. There is no key in this repo and
 * inventing a scheme would be security theatre, so what is implemented is tamper
 * EVIDENCE: a checksum that notices the stored text changed. It does not stop anyone who
 * recomputes it, and these tests deliberately assert that limitation rather than implying
 * protection that is not there.
 */

function script(source: string, extra: Partial<ScriptData> = {}): ScriptData {
	return {
		id: "pine_1",
		name: "s",
		source,
		created: "2026-01-01T00:00:00.000Z",
		lastModified: "2026-01-01T00:00:00.000Z",
		...extra,
	}
}

const stamp = (s: ScriptData): ScriptData => ({
	...s,
	integrity: { checksum: scriptChecksum(s.source), sourceLength: s.source.length },
});

describe("A25 script integrity", () => {
	it("checksum is stable and length-sensitive", () => {
		expect(scriptChecksum("abc")).toBe(scriptChecksum("abc"));
		expect(scriptChecksum("abc")).not.toBe(scriptChecksum("abd"));
		// A same-length swap must not collide, and a length change must show up.
		expect(scriptChecksum("plot(close)")).not.toBe(scriptChecksum("plot(closes)"));
	});

	it("a script saved then untouched is intact", () => {
		const s = stamp(script("plot(close)"));
		expect(isScriptIntact(s)).toBe(true);
	});

	it("a script whose text changed underneath it is NOT intact", () => {
		const s = stamp(script("plot(close)"));
		s.source = "plot(open)" // simulates a hand edit or a half-written autosave
		expect(isScriptIntact(s)).toBe(false);
	});

	it("a legacy script with no integrity block loads without warning", () => {
		expect(isScriptIntact(script("plot(close)"))).toBe(true);
		expect(findAlteredScripts({ a: script("plot(close)") })).toEqual([]);
	});

	it("a truncation is caught", () => {
		const s = stamp(script("plot(close)\nplot(open)"));
		s.source = "plot(close)"
		expect(isScriptIntact(s)).toBe(false);
	});

	it("findAlteredScripts lists only the moved ones", () => {
		const good = stamp(script("plot(close)"))
		const bad = stamp(script("plot(open)"))
		bad.source = "// edited"
		const legacy = script("plot(high)")
		expect(findAlteredScripts({ a: good, b: bad, c: legacy })).toEqual(["b"]);
	});

	it("does NOT claim cryptographic protection: recomputing the checksum defeats it", () => {
		const s = stamp(script("plot(close)"))
		s.source = "// malicious payload"
		// Re-stamping makes the tampered text look clean. That is the documented limit,
		// pinned here so nobody later reads the presence of the field as "signed".
		const restamped = stamp(s)
		expect(isScriptIntact(restamped)).toBe(true)
	})
})
