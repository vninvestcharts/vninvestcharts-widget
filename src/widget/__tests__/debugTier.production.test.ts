// H0.9 — the "it cannot ship as a live prop" lock for `debugTier`.
//
// Why this file exists separately from the render tests in
// VNInvestCharts.runtimeMounts.contract.test.tsx:
//
// The render pair there proves the RUNTIME claim — in a production environment the
// override does not reach the capability gate. That claim is necessary and it is not
// sufficient, for the same reason contexts/__tests__/devLicenseHook.production.test.ts
// does not settle for a runtime assertion: a bundler is free to keep the branch. Put
// the guard behind `isProduction()` and it still works — while shipping, which means the
// override expression itself rides along in the shipped bytes and one later refactor
// can revive it without anybody noticing.
//
// So the guarantee is two-part, and the second part is structural:
//
//   1. runtime  — debugTier cannot open a gated surface when NODE_ENV is production.
//   2. shape    — the override is read in exactly ONE place, behind ONE inline bare
//                 `process.env.NODE_ENV` comparison. No helper, no second call site.
//
// A unit test can assert (1) but not (2). This file asserts (2) against the source
// text, which is the same technique the dev-license-hook lock uses against emitted
// bytes. It is deliberately text-coupled: "there is exactly one guarded read" is a
// property of this file's shape, and a reformat that breaks it must fail loudly for a
// human rather than quietly turn this into a no-op.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const WIDGET_SOURCE = path.resolve(__dirname, "../VNInvestCharts.tsx");
const read = () => readFileSync(WIDGET_SOURCE, "utf8");

describe("H0.9 debugTier production guard — structural lock", () => {
	it("reads props.debugTier in exactly ONE place", () => {
		const reads = read().match(/props\.debugTier/g) ?? [];
		// Pre-H0.9 this was 2 (the `useTierGatedFeatures` tier argument and the
		// `CapabilityProvider` tier prop). Two reads is two chances to wire the raw prop
		// into a gate, so the count is the invariant.
		expect(reads).toHaveLength(1);
	});

	it("the single read sits behind an inline bare process.env.NODE_ENV test", () => {
		const source = read();
		// Deliberately forbids the helper form: `!isProduction()` (the helper at
		// contexts/SaaSFeatureContext.tsx:43) is what `debugFeatures` uses, and it is
		// exactly why debugTier ended up unguarded in the first place — the two debug
		// props looked interchangeable and only one of them was gated.
		expect(source).not.toMatch(/!isProduction\(\)[^;]{0,200}debugTier/);
		expect(source).not.toMatch(/debugTier[^;]{0,200}!isProduction\(\)/);
		// The guarded read, whole expression. `typeof process !== "undefined"` first so
		// this cannot throw in a browser bundle with no process shim.
		expect(source).toMatch(
			/typeof process\s*!==\s*"undefined"\s*&&\s*process\.env\.NODE_ENV\s*!==\s*"production"[\s\S]{0,120}\?\s*props\.debugTier\s*:\s*undefined/,
		);
	});

	it("MUTATION GUARD: feeding props.debugTier straight into a gate fails", () => {
		// The structural regression. Restoring the pre-H0.9 expression —
		//   useTierGatedFeatures(props.debugTier ?? effectiveToolbarTier, {
		//       narrowing: props.debugTier ? undefined : licenseCapabilities,
		// — or simply writing a new unguarded consumer for the prop, must break the
		// one-read count above and the two assertions here.
		const source = read();
		expect(source).not.toContain("useTierGatedFeatures(props.debugTier");
		// And the CapabilityProvider must read the guarded value, not the prop.
		expect(source).not.toMatch(/<CapabilityProvider[^>]*tier=\{props\.debugTier/);
		expect(source).toMatch(
			/<CapabilityProvider[^>]*tier=\{debugTierOverride \?\? effectiveToolbarTier\}/,
		);
	});

	it("the docs claim matches the code", () => {
		// VNInvestChartsProps.ts:141 previously asserted "KHÔNG phải đường vòng license:
		// đây chỉ ảnh hưởng gate cấp UI" — true of the engine, false of the widget, which
		// is what made the unguarded prop look safe. The docblock must now state the
		// production behaviour, or the next reader trusts the old sentence again.
		const propsDoc = readFileSync(
			path.resolve(__dirname, "../VNInvestChartsProps.ts"),
			"utf8",
		);
		expect(propsDoc).toMatch(/debugTier\?:/);
		expect(propsDoc).toMatch(/production build prop này bị \*\*bỏ qua hoàn toàn\*\*/);
	});
});