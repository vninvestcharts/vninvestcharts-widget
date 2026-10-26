import fs from "node:fs";
import path from "node:path";

import { defineConfig, configDefaults } from "vitest/config";

// Where the twin engine checkout lives. Defaults to the sibling repo, but a
// worktree must be able to point the suite at itself: hardcoding the sibling
// made these tests silently run against a different engine than the one under
// edit (2026-09-27, during the drawing SSOT migration).
//
// When there is no checkout, the engine aliases are dropped and the installed
// packages are used, so the suite also runs for a consumer or a CI runner.
//
// F-ARCH-02 (fixed 2026-10-16). This block used to key off the engine's `src/` only, while
// `scripts/gen-engine-tsconfig-paths.mjs` requires `packages/*/dist/index.d.ts`. The two
// disagreed on the state "checkout present but not built": vitest aliased to `src/` and ran the
// whole suite green, while `tsc` exited 1 — a commit could be described as tests-passing with
// type-check broken. They now ask the same question, and the answer is the strict one: an engine
// that is present but unbuilt is an ERROR, not a fallback. Falling back to node_modules here
// would be worse than failing, because the suite would then grade an engine nobody is editing.
const engineRepo = process.env.VN_ENGINE_REPO
	? path.resolve(process.env.VN_ENGINE_REPO)
	: path.resolve(__dirname, "../vninvestcharts-engine");
const engineRepoExists = fs.existsSync(
	path.resolve(engineRepo, "packages", "vn-kline-engine-drawing", "src/index.ts"),
);
const ENGINE_PACKAGES = ["vn-kline-engine-core", "vn-kline-engine-react", "vn-kline-engine-drawing", "vn-kline-engine-pro"];
const unbuiltEnginePackages = engineRepoExists
	? ENGINE_PACKAGES.filter((name) => !fs.existsSync(path.resolve(engineRepo, "packages", name, "dist/index.d.ts")))
	: [];

if (unbuiltEnginePackages.length > 0) {
	// Same rule as gen-engine-tsconfig-paths, which fails closed for the same reason (AGENTS.md
	// Rule 13: the widget consumes the engine's BUILT dist, never its source).
	console.error(
		`vitest: FAIL - the engine checkout at ${engineRepo} is present but not built.\n` +
			`  missing dist/index.d.ts in: ${unbuiltEnginePackages.join(", ")}\n` +
			`  Build it first:  cd ${engineRepo} && npm run build\n` +
			`  Or point VN_ENGINE_REPO at a built checkout, or unset it to test the published packages.\n` +
			`  Running against unbuilt engine source would grade code that tsc cannot type-check, which is F-ARCH-02.`,
	);
	process.exit(1);
}

const enginePkg = (name: string) =>
	engineRepoExists ? path.resolve(engineRepo, "packages", name, "src/index.ts") : null;

export default defineConfig({
	resolve: {
		alias: Object.fromEntries(
			Object.entries({
				"@vninvestcharts/vn-kline-engine-core": enginePkg("vn-kline-engine-core"),
				"@vninvestcharts/vn-kline-engine-react": enginePkg("vn-kline-engine-react"),
				"@vninvestcharts/engine-core": enginePkg("vn-kline-engine-core"),
				"@vninvestcharts/engine-react": enginePkg("vn-kline-engine-react"),
				// S4.2/F-22: widget tests read engine-drawing from src (same as core/react).
				"@vninvestcharts/engine-drawing": enginePkg("vn-kline-engine-drawing"),
				// open-core split: engine-pro (pattern-detector, premium drawing tools) — private, local dev via sibling.
				"@vninvestcharts/engine-pro": enginePkg("vn-kline-engine-pro"),
				// open-core split Phase 2a: widget-pro skeleton — local dev via packages/ sub-package.
				"@vninvestcharts/widget-pro": path.resolve(__dirname, "packages/vn-kline-widget-pro/src/index.ts"),
				"@lib": path.resolve(__dirname, "src/lib"),
			}).filter((entry): entry is [string, string] => Boolean(entry[1])),
		),
		dedupe: ["react", "react-dom"],
	},
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./tests/vitest.setup.ts"],
		// BL-04: anti-regression floor. Re-measured 2026-10-08 with
		// `npm test -- --coverage --coverage.reporter=text` (395 files / 3301
		// tests green, exit 0): statements 62.62 / branches 79.60 /
		// functions 59.02 / lines 62.62.
		//
		// Earlier measurements, kept because the ratchet only makes sense against a
		// history: 2026-09-24 (384 files) was 61.65 / 72.09 / 57.05 / 61.65.
		// 2026-10-07 measured 62.81; it dropped 0.19 after the storage-SSOT commit,
		// because consolidating three hand-rolled guards removed more lines than the
		// adapter added. A floor that only ever goes up would have called that a
		// regression; it is a 0.19-point redistribution inside a 1.8-point margin.
		//
		// The floor is now measured-minus-roughly-1.8 points, NOT the measured value.
		// Setting it AT the measurement would make any unrelated one-line change fail
		// CI, which is how a floor stops being read. Target stays 80 (ledger BL04);
		// ratchet +2/phase from here.
		coverage: {
			thresholds: {
				lines: 61,
				branches: 77,
				functions: 57,
				statements: 61,
			},
		},
		// Discovery is the vitest 1.x default: include `**/*.{test,spec}.?(c|m)[jt]s?(x)`
		// minus these. That is why the suite collects 390 files: 393 on disk, less the 1
		// under tests/visual and the 2 under tests/e2e. `tests/soak` is deliberately NOT
		// excluded, so soak runs inside `npm test` - see the timeouts below.
		exclude: [...configDefaults.exclude, "tests/visual/**", "tests/e2e/**", "scratch/**"],
		// Test timeout: 120 seconds (2 minutes) to prevent infinite loops/hanging tests
		testTimeout: 120000,
		// Hook timeout for setup/teardown: 60 seconds
		hookTimeout: 60000,
		// Enable test retry for flaky tests (1 retry in CI)
		retry: process.env.CI ? 1 : 0,
	},
});
