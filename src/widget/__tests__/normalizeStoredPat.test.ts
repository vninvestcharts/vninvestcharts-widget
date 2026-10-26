import { describe, expect, it } from "vitest";
import { normalizeStoredPat } from "../contexts/SaaSFeatureContext";

// LIC-FIX regression: key ký số vni1.* không được prepend vni_;
// key đã hỏng vni_vni1.* tự chữa; bare prefix giữ hành vi cũ.
describe("normalizeStoredPat", () => {
	it("keeps signed vni1.* keys byte-identical", () => {
		const key = "vni1.eyJ0IjoicHJvIiwiZSI6MTg5MzQ1NjAwMH0.c2ln";
		expect(normalizeStoredPat(key)).toBe(key);
	});

	it("heals previously mangled vni_vni1.* keys", () => {
		expect(normalizeStoredPat("vni_vni1.eyJ0IjoicHJvIiwiZSI6MTg5MzQ1NjAwMH0.c2ln")).toBe(
			"vni1.eyJ0IjoicHJvIiwiZSI6MTg5MzQ1NjAwMH0.c2ln",
		);
	});

	it("keeps legacy full tokens and bare prefixes as before", () => {
		expect(normalizeStoredPat("vni_pro_abc")).toBe("vni_pro_abc");
		expect(normalizeStoredPat("pro")).toBe("vni_pro");
		expect(normalizeStoredPat("")).toBe("");
	});

	it("passes structured foreign tokens through verbatim (no prefix mangling)", () => {
		// A backend that issues JWTs, sk- keys, or opaque alphabets must receive
		// exactly what the user pasted. Prefixing those corrupted the token, the
		// backend 401d it, and the UI blamed the key format.
		const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
		expect(normalizeStoredPat(jwt)).toBe(jwt);
		expect(normalizeStoredPat("sk-live-abc123XYZ")).toBe("sk-live-abc123XYZ");
		expect(normalizeStoredPat("abc123.def456")).toBe("abc123.def456");
	});
});
