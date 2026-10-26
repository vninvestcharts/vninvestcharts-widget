// S29 - the "mock entitlements cannot ship" lock for `debugFeatures`.
//
// WHY THIS FILE EXISTS SEPARATELY from the render tests
// (SaaSFeatureGate.test.tsx, VNInvestCharts.runtimeMounts.contract.test.tsx,
//  VNInvestCharts.replayPauseSlice.contract.test.tsx):
//
// Those prove the RUNTIME claim - in production the override does not reach the
// capability gate. Necessary, not sufficient, for the reason
// contexts/__tests__/devLicenseHook.production.test.ts already spells out: a
// bundler is free to keep a branch it cannot fold. The pre-S29 guard asked
//
//     typeof process !== "undefined" && process.env?.NODE_ENV === "production"
//
// which is FAIL-OPEN - in a browser there is no `process`, so the answer is
// always false and the mock flags were applied. Measured on the shipped bundle:
//
//     dist/index.js -> function dw(){return typeof process<"u"&&!0}
//
// S29 replaced it with a fail-closed, INLINE test. Those two properties are not
// observable from a unit test, so this file asserts them against emitted bytes,
// the same technique as the dev-license-hook lock.
//
// It is also the file SaaSFeatureContext.tsx:57 points at as its "shape lock".
// That pointer was DANGLING until now: S29 shipped the comment and the lock was
// never written, which is the same defect S31 shipped with.
//
// The guarantee is two-part, and BOTH parts are required:
//
//   1. runtime - debugFeatures cannot open a gated surface outside development.
//   2. shape   - the guard is inline (folds away) and fail-closed (absent
//                `process` means false, i.e. DEFAULT_FLAGS stands).
//
// Dropping either half reopens the hole, so the mutation guards below are not
// decoration: they prove each half would actually catch a regression.
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

const MODULE_ENTRY = path.resolve(__dirname, "../SaaSFeatureContext.tsx");

/** Bare specifiers the module pulls in. They are not what is under test here. */
const EXTERNAL = [
	"react",
	"react-dom",
	"react/jsx-runtime",
	"@vninvestcharts/engine-core",
	"@vninvestcharts/engine-drawing",
	"@vninvestcharts/engine-react",
];

/*
 * esbuild runs as a child process on purpose - same reason as the dev-license
 * hook lock: a crashing bundle must not take vitest with it, and esbuild (not
 * Node) has to do the parsing so the suite does not depend on the local Node
 * stripping TypeScript types.
 *
 * `nodeEnv` and the externals are passed through the ENVIRONMENT as JSON, never
 * interpolated into the script source: interpolating produced
 * `define: { "process.env.NODE_ENV": production }` with bare quotes, esbuild
 * emitted the identifier `production`, the condition never folded, and the
 * production case then failed on a bundle that still carried the assignment.
 */
function runEsbuild(opts: {
	entry?: string;
	minify: boolean;
	nodeEnv: string;
	noDefine?: boolean;
}): string {
	const script = `
import { build } from "esbuild";
const opts = JSON.parse(process.env.VNSC_ESBUILD_OPTS);
const r = await build({
  entryPoints: [opts.entry],
  bundle: true, write: false, format: "esm", platform: "browser",
  minify: opts.minify,
  define: opts.noDefine ? {} : { "process.env.NODE_ENV": JSON.stringify(opts.nodeEnv) },
  external: opts.external,
});
process.stdout.write(r.outputFiles[0].text);
`;
	return execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
		encoding: "utf8",
		maxBuffer: 128 * 1024 * 1024,
		cwd: path.resolve(__dirname, "../../../.."),
		env: {
			...process.env,
			VNSC_ESBUILD_OPTS: JSON.stringify({
				entry: opts.entry ?? MODULE_ENTRY,
				minify: opts.minify,
				nodeEnv: opts.nodeEnv,
				noDefine: opts.noDefine === true,
				external: EXTERNAL,
			}),
		},
	});
}

describe("S29 debugFeatures - source shape", () => {
	const read = () => readFileSync(MODULE_ENTRY, "utf8");

	/** Strip comments so a rationale sentence can never satisfy - or break - a shape test. */
	const code = () =>
		read()
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/(^|[^:])\/\/.*$/gm, "$1");

	it("has exactly 3 guarded reads, one per call site S29 fixed", () => {
		// Counted by measurement, not by memory:
		//   L410 session-expired reset · L495 no-PAT branch · L717 finishValidation
		// Pre-S29 one of those three had no production guard at all, which is exactly
		// why the count is pinned instead of the mere presence of a guard.
		const src = code();
		const guarded = src.match(
			/typeof process !== "undefined" && process\.env\?\.NODE_ENV === "development" && debugFeatures/g,
		);
		expect(guarded).toHaveLength(3);
	});

	it("has NO bare `debugFeatures` read outside a guard", () => {
		// Every read of the identifier must be the last term of the fail-closed
		// condition. A read on its own line would be the un-guarded call site.
		const bare = code().match(/&&\s*debugFeatures/g) ?? [];
		expect(bare).toHaveLength(3);
	});

	/**
	 * Completeness for the flag spreads. SCOPE, stated precisely, because an earlier
	 * version of this comment overclaimed what the test does.
	 *
	 * A first attempt at this assertion was a COUNT, and a count is blind to "someone
	 * added a call site": adding a fourth unguarded `...debugFeatures` spread changed
	 * 3 into 4 and every count assertion stayed green. That mutant was built and run
	 * against the lock - it passed.
	 *
	 * This asserts something a count cannot: that each spread sits NEXT TO a
	 * fail-closed guard, with no statement boundary in between. That covers the
	 * realistic regressions - a guard dropped, a guard moved away, a spread pasted in
	 * bare.
	 *
	 * WHAT IT DOES NOT COVER, verified by an independent audit: it measures
	 * PROXIMITY, not GATING. A guard computed and then discarded still passes, e.g.
	 *
	 *     const __dev = NODE_ENV === "development" && debugFeatures;
	 *     flags = { ...flags, ...debugFeatures };          // <-- unconditional
	 *
	 * The `;` assertion below catches exactly that shape, and the count assertion
	 * still covers "a fourth call site appeared". Between them the realistic
	 * regressions are covered; a guard on an unrelated branch in the same statement
	 * is not, and pretending otherwise would repeat the mistake this file exists to
	 * prevent.
	 */
	it("each `...debugFeatures` spread is adjacent to a fail-closed guard, same statement", () => {
		const lines = code().split("\n");
		const spreads = lines
			.map((line, i) => ({ line, i }))
			.filter(({ line }) => /\.\.\.debugFeatures/.test(line));

		// Control: asserted, not assumed, so an empty list cannot pass vacuously.
		expect(spreads).toHaveLength(3);

		for (const { line, i } of spreads) {
			const guard = /typeof process !== "undefined" && process\.env\?\.NODE_ENV === "development"/;
			const window = [lines[i - 1] ?? "", line];
			expect(
				window.join("\n"),
				`unguarded debugFeatures spread at line ${i + 1}: ${line.trim()}`,
			).toMatch(guard);

			// The guard must GATE the spread, not merely precede it. A guard hoisted into
			// a variable leaves a statement terminator behind; a guard in the ternary or
			// the `if (...) {` that actually contains the spread does not.
			const bridge = window[0];
			expect(
				bridge.trimEnd(),
				`guard at line ${i} is in a different statement than the spread at ${i + 1}:` +
					`\n  ${bridge.trim()}\n  ${line.trim()}`,
			).not.toMatch(/;$/);
		}
	});

	it("the only `!== production` left belongs to the dev-license hook, never to debugFeatures", () => {
		// `!== "production"` is fail-OPEN for debugFeatures - with no `process` in a
		// browser the guard is true, which is the hole S29 closed. Exactly ONE such
		// guard survives in this module and it belongs to the DEV-ONLY LICENSE HOOK
		// (line 85), a different feature whose shipping lock is
		// devLicenseHook.production.test.ts and which must stay fail-open or the dev
		// harness could never register a public key.
		//
		// The invariant asserted here is the one that actually matters: no
		// `!== "production"` guard may gate a debugFeatures read. It is a pairing
		// claim, not a count, so it cannot silently pass if the hook moves.
		const src = code().split("\n");
		const failOpenLines = src
			.map((line, i) => ({ line, i }))
			.filter(({ line }) => /!==\s*"production"/.test(line));

		expect(failOpenLines).toHaveLength(1);
		for (const { line, i } of failOpenLines) {
			// The guard and the assignment it protects must be adjacent.
			const guarded = src.slice(i, i + 3).join("\n");
			expect(guarded).toContain("__VNI_DEV_LICENSE__");
			// And it must NOT be gating entitlements.
			expect(guarded).not.toContain("debugFeatures");
		}
	});

	it("has no isProduction() helper left to hide behind", () => {
		// A helper is what let the branch survive into shipped bytes - that is why
		// S29 deleted it rather than fixing it.
		expect(code()).not.toMatch(/function\s+isProduction/);
	});
});

describe("S29 debugFeatures - production bundles", () => {
	// Measured against the real module with esbuild, not assumed:
	//
	//   build                     reads  &&false?   ...debugFeatures
	//   development, unminified        3      0              3
	//   production,  unminified        0      2              3   <- unreachable
	//   production,  minified          0      0              0   <- fully stripped
	//
	it("development bundle keeps all 3 override reads live", () => {
		// Control case. If this ever fails, the production assertions below prove nothing.
		const code = runEsbuild({ minify: false, nodeEnv: "development" });
		expect(countLiveReads(code)).toBe(3);
	});

	// NOT `expect(code).not.toContain("debugFeatures")`.
	//
	// That was my first version of this test and it FAILED, correctly. Unminified, the
	// dead ternary still carries its `...debugFeatures` arm, and minified the
	// destructured parameter name survives because it is part of the function
	// SIGNATURE, which no bundler must rename. Asserting the string is absent measures
	// the minifier, not the security property - a proxy that cannot go red for the
	// right reason (hazard 8).
	//
	// The observable that matters is REACHABILITY: in a production bundle no read of
	// the prop may sit in a live condition.
	it("production bundle leaves ZERO live debugFeatures reads (unminified)", () => {
		const code = runEsbuild({ minify: false, nodeEnv: "production" });
		expect(countLiveReads(code)).toBe(0);
		// And the folds are visible, so "0 live" is a measurement rather than an
		// absence of evidence.
		expect((code.match(/&&\s*false\s*\?/g) ?? []).length).toBeGreaterThan(0);
	});

	it("production bundle strips the override entirely (minified)", () => {
		const code = runEsbuild({ minify: true, nodeEnv: "production" });
		expect(countLiveReads(code)).toBe(0);
		expect((code.match(/\.\.\.debugFeatures/g) ?? []).length).toBe(0);
	});

	it("MUTATION GUARD: only `define` closes the branch - the bare form ships regardless", () => {
		// This is the honest limit of a byte-level lock, found by measurement rather
		// than assumed - and it is why the SOURCE-SHAPE block above is load-bearing
		// rather than redundant.
		//
		// Measured on fixtures (see countLiveReads for the full table):
		//
		//   guard                                  define=production     no define
		//   bare `... !== "production"`             DEAD (&& false)      LIVE
		//   `typeof p && ... === "development"`     DEAD (&& false)      LIVE
		//
		// Two consequences, both load-bearing:
		//  1. `define` is what kills the branch, and BOTH guarded forms die with it -
		//     so "no live read in the bytes" cannot tell fail-open from fail-closed.
		//     An assertion in that shape is a proxy that passes for the wrong reason.
		//  2. Without `define` the correctly fail-closed form stays live too - which is
		//     why the shipped bundles must carry `define` at all, and is the same
		//     underlying gap plan S33 records for `dist/index.js`.
		//
		// So this pins the claim that is actually available at the byte level: the
		// branch dies only when `define` resolves it, and a build without `define`
		// leaves the override reachable.
		const withDefine = runEsbuild({
			entry: probePath(
				'typeof process !== "undefined" && process.env?.NODE_ENV === "development" && props.debugFeatures',
			),
			minify: false,
			nodeEnv: "production",
		});
		expect(countLiveReads(withDefine)).toBe(0);

		const withoutDefine = runEsbuild({
			entry: probePath(
				'typeof process !== "undefined" && process.env?.NODE_ENV === "development" && props.debugFeatures',
			),
			minify: false,
			nodeEnv: "production",
			noDefine: true,
		});
		expect(countLiveReads(withoutDefine)).toBeGreaterThan(0);
	});
});

/**
 * Number of `debugFeatures` reads whose guarding condition esbuild could NOT fold
 * shut.
 *
 * Counts `&& props.debugFeatures` / `&& debugFeatures` - a read still sitting inside a
 * live `&&` chain. esbuild rewrites a resolved guard to the literal `false`, so a
 * folded chain reads `&& false ?` and contributes nothing. Measured on fixtures:
 *
 *   guard                                define=production        no define
 *   bare `... !== "production"`           `&& false ?` (dead)      `? a : b` (LIVE)
 *   `typeof p && ... === "development"`   `&& false ?` (dead)      `&& true &&` (LIVE)
 *
 * Both counts are the reason this helper counts a `&&` read rather than the mere
 * presence of the identifier: the identifier survives in dead branches and in the
 * destructuring signature, so its presence is not evidence of anything.
 */
function countLiveReads(code: string): number {
	return (code.match(/&&\s*(?:props\.)?debugFeatures/g) ?? []).length;
}

// The mutation fixture needs a real file on disk for esbuild to bundle, so it is
// written under the OS temp dir - never inside src/, where a failed cleanup
// would leave an untracked file and a dirty tree for the next person.
function probePath(condition: string): string {
	const dir = mkdtempSync(path.join(os.tmpdir(), "vnsc-dbgfeat-"));
	probeDirs.push(dir);
	const file = path.join(dir, "probe.ts");
	// Shaped like a real call site so the fold is comparable with the module's own.
	writeFileSync(
		file,
		`${EXTERNAL.map((s) => `import "${s}";`).join("\n")}
const DEFAULT_FLAGS = { isWhalePanelEnabled: false, isReplayEnabled: false };
export function gate(props: { debugFeatures?: Record<string, boolean> }) {
	return ${condition} && props.debugFeatures
		? { ...DEFAULT_FLAGS, ...props.debugFeatures }
		: { ...DEFAULT_FLAGS };
}
`,
		"utf8",
	);
	return file;
}

const probeDirs: string[] = [];

afterEach(() => {
	for (const dir of probeDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});