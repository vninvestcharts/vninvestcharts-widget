#!/usr/bin/env node
/**
 * GATE: the bundles under the checked directory must be PRODUCTION bundles.
 *
 * WHY THIS EXISTS
 * ===============
 * `build:docs` set `NODE_ENV=production` but omitted `--mode`, and
 * `config/webpack.config.js` keys `isProduction` off `argv.mode`. Webpack therefore ran in
 * DEVELOPMENT mode: no terser, 24.53 MB instead of 6.41 MB, eval source maps — and, the
 * part that matters, the dev-only license hook SURVIVED in the shipped bytes.
 *
 * The repo already states the invariant and tests it, but against a bundle it makes itself
 * with esbuild: `src/widget/contexts/__tests__/devLicenseHook.production.test.ts` asserts
 * a production bundle does NOT contain the hook, and carries a mutation guard for the exact
 * refactor that would defeat esbuild's branch folding. Nothing checked the webpack output,
 * which is the artifact a person actually deploys.
 *
 * So this closes that gap: the check runs as part of the build, not as a test someone has
 * to remember to run.
 *
 * Also asserts the bundles are actually minified. Minification is what removes the branch at
 * all — the production test's own third case documents that an unminified production bundle
 * can still contain the string inside an already-folded `&& false` branch. So "contains the
 * symbol" and "is minified" are two halves of the same guarantee, and both are checked, and
 * they deliberately share one exit code: once both halves genuinely hold, splitting them
 * would only create a way to run half the check.
 *
 * Usage: node scripts/check-bundle-mode.cjs --dir <dir> [--dir <dir> ...]
 * Exit:  0 = production bundles, 1 = they are not (or are missing)
 *
 * `--dir` is REQUIRED and repeatable. It used to default to `build`, which meant a typo, a
 * renamed output directory, or checking `build/` when the interesting artifact was in `dist/`
 * all silently verified the wrong bytes — and a missing directory under that default produced
 * the same green as a passing run only if it happened to exist, which is the worst kind of
 * silent. Measured at 405b12a the gap was real: `dist/index.cjs` carried the hook while this
 * gate reported only `index.js`, because the file filter matched `.js` and never `.cjs`.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

/**
 * Bundles are recursive and include `.cjs`. Both were gaps, not preferences:
 *   - `.js` only  -> `dist/index.cjs` was never scanned. The `require` entry of the
 *                    published package carried the dev hook and this gate stayed green.
 *   - top level  -> `dist/iframe/vninvestchart.iframe.js`, `dist/adapters/index.js` and the
 *                    other subpath bundles were never scanned either.
 */
const BUNDLE_EXTENSIONS = [".js", ".cjs"];
const MIN_AVG_LINE_LENGTH = 200;

function parseDirs(argv) {
	const dirs = [];
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] !== "--dir") continue;
		const value = argv[i + 1];
		if (!value || value.startsWith("--")) {
			console.error("check-bundle-mode: --dir needs a directory path");
			process.exit(1);
		}
		dirs.push(path.resolve(ROOT, value));
		i++;
	}
	return dirs;
}

/** Every bundle file under `dir`, recursively. Sorted so output is reproducible. */
function collectBundles(dir) {
	const found = [];
	const walk = (current) => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (BUNDLE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) found.push(full);
		}
	};
	walk(dir);
	return found.sort();
}

/** The dev-only trust anchor. Same symbol the production unit test pins. */
const HOOK_SYMBOL = "__VNI_DEV_LICENSE__";

const dirs = parseDirs(process.argv.slice(2));
if (dirs.length === 0) {
	console.error("check-bundle-mode: --dir <dir> is required.");
	console.error("  There is no safe default: the artifacts this gate protects live in");
	console.error("  `dist/` (npm) and `build/` (docs demo), and a wrong default verifies the");
	console.error("  wrong bytes without saying so. Pass the directory you actually built.");
	process.exit(1);
}

const offenders = [];
const unminified = [];
let totalBytes = 0;
let totalLines = 0;
let bundleCount = 0;

for (const dir of dirs) {
	const rel = path.relative(ROOT, dir) || ".";
	if (!fs.existsSync(dir)) {
		console.error(`check-bundle-mode: ${rel}/ does not exist — nothing was verified`);
		process.exit(1);
	}
	const bundles = collectBundles(dir);
	if (bundles.length === 0) {
		console.error(`check-bundle-mode: no ${BUNDLE_EXTENSIONS.join("/")} in ${rel}/ — the build produced nothing to check`);
		process.exit(1);
	}
	for (const full of bundles) {
		const code = fs.readFileSync(full, "utf8");
		totalBytes += code.length;
		totalLines += code.split("\n").length;
		bundleCount++;
		if (code.includes(HOOK_SYMBOL)) offenders.push(path.relative(ROOT, full));
	}
}

// Minified bundles are single-very-long-line; a development bundle keeps newlines and
// readable names. A cheap, robust proxy: the longest line covers most of the file.
// Measured: dist/*.js averaged 75 chars/line unminified and 557 minified, against this
// threshold of 200 — so it discriminates, and it is not tuned per artifact.
const avgLineLength = Math.round(totalBytes / Math.max(1, totalLines));
if (avgLineLength < MIN_AVG_LINE_LENGTH) {
	unminified.push(avgLineLength);
}

if (offenders.length > 0) {
	console.error("check-bundle-mode: FAILED — this is not a production bundle.");
	for (const dir of dirs) console.error(`  checked ${path.relative(ROOT, dir) || "."}/`);
	console.error(`  ${offenders.length}/${bundleCount} bundle file(s) still contain ${HOOK_SYMBOL}:`);
	for (const f of offenders) console.error(`    ${f}`);
	console.error("  The dev-only license backdoor ships in a release artifact. See");
	console.error("  src/widget/contexts/__tests__/devLicenseHook.production.test.ts for the invariant.");
	if (dirs.length === 1 && path.relative(ROOT, dirs[0]) === "build") {
		console.error("  For the webpack output: build:docs must pass --mode production; webpack keys");
		console.error("  isProduction off argv.mode (config/webpack.config.js).");
	} else {
		console.error("  For the esbuild output: `define` alone only folds the guard to `&& false`.");
		console.error("  The guard is removed by the minify pass in build-esm-cjs.js.");
	}
	process.exit(1);
}

if (unminified.length > 0) {
	console.error("check-bundle-mode: FAILED — the hook is gone but this does not look minified.");
	for (const dir of dirs) console.error(`  checked ${path.relative(ROOT, dir) || "."}/`);
	console.error(`  average line length ${unminified[0]} (minified bundles average in the thousands).`);
	console.error(`  Without minification the dev-only branch is only folded to \`&& false\`, not removed.`);
	process.exit(1);
}

console.log(
	`check-bundle-mode: PASS — ${bundleCount} bundle(s) across ${dirs.length} dir(s), ` +
		`${(totalBytes / 1024 / 1024).toFixed(2)} MB, avg line ${avgLineLength} chars. ${HOOK_SYMBOL} absent.`,
);