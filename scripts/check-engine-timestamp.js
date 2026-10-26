#!/usr/bin/env node
/**
 * Engine build freshness — HONEST REPORTING, not enforcement.
 *
 * HISTORY, because the previous version of this file was worse than nothing.
 * It compared dist/ against src/ MODIFICATION TIMES and exited 1 on a perfectly
 * clean tree: a fresh checkout touches src mtimes without any code changing.
 * Measured 2026-09-26 — src/licenseValidator.ts at 18:47, dist/index.cjs at
 * 08:01, reported "dist/ stale", while a content probe showed dist already held
 * every distinctive literal of the current source and `git diff HEAD` in the
 * engine was empty. A gate that fails for the wrong reason is worse than no
 * gate: it teaches people to bypass it and it hides the real staleness it was
 * added to catch.
 *
 * WHY THERE IS NO HARD CHECK HERE. Two facts, both verified:
 *   1. The engine gitignores dist/ (its .gitignore:10), so "is dist newer than
 *      the last src commit" cannot be answered from history.
 *   2. The engine bundle is tree-shaken, so the exported names in src/ are NOT a
 *      subset of the bundle. A content probe reported 143 "missing" exports on a
 *      clean, correctly-built tree — the probe was wrong, not the build.
 * Together these mean no cheap local signal can distinguish "stale dist" from
 * "checkout touched mtimes". Claiming otherwise would be inventing certainty.
 *
 * So this script reports and only hard-fails on states it can actually prove:
 *   - a package has src/ but no dist/ at all        => FAIL, provable
 *   - dist/ exists but contains no bundle           => FAIL, provable
 *   - dist mtime older than src mtime               => WARN, not provable
 * The rule that actually protects you is AGENTS.md Rule 13: after changing engine
 * source, rebuild before trusting any widget verification. That is a procedure,
 * not something a script can enforce here.
 *
 * Usage: node scripts/check-engine-timestamp.js [engine-repo-path]
 *   VN_ENGINE_REPO is honoured, matching tsup/webpack/vitest/tsconfig so every
 *   tool in this repo measures the same engine checkout. The positional arg
 *   still wins for one-off comparisons against a second checkout.
 * Exit: 0 always unless a provable failure is found. Warnings are visible.
 */
const fs = require('fs');
const path = require('path');

const ENGINE_REPO = path.resolve(
	__dirname,
	'..',
	process.argv[2] || process.env.VN_ENGINE_REPO || '../vninvestcharts-engine',
);
const PACKAGES = ['vn-kline-engine-core', 'vn-kline-engine-react', 'vn-kline-engine-drawing'];

function newestMtime(dir, exts) {
	let latest = 0;
	if (!fs.existsSync(dir)) return latest;
	const walk = (d) => {
		for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
			const full = path.join(d, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (!exts || exts.some((e) => entry.name.endsWith(e))) {
				try { latest = Math.max(latest, fs.statSync(full).mtimeMs); } catch { /* ignore */ }
			}
		}
	};
	walk(dir);
	return latest;
}

function hasBundle(dir) {
	if (!fs.existsSync(dir)) return false;
	const walk = (d) => {
		for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
			const full = path.join(d, entry.name);
			if (entry.isDirectory()) { if (walk(full)) return true; }
			else if (/\.(cjs|mjs|js)$/.test(entry.name) && !/\.map$/.test(entry.name)) return true;
		}
		return false;
	};
	return walk(dir);
}

let hardFail = false;
let warned = 0;

// A missing src/ used to be a silent SKIP, which meant a typo'd VN_ENGINE_REPO
// made this gate print "all clean" while checking nothing. So an explicitly
// named engine that is not a usable checkout is still a hard failure.
//
// When no engine is named and there is no sibling checkout, the gate reports
// itself as not applicable and passes. That is the consumer / CI case, where the
// engine comes from the registry: a published version is immutable, so it cannot
// be stale relative to the widget. Failing there would block every clean
// checkout for no reason.
if (!fs.existsSync(path.join(ENGINE_REPO, 'packages'))) {
	if (process.env.VN_ENGINE_REPO || process.argv[2]) {
		console.error(
			`check-engine-timestamp: no packages/ directory under ${ENGINE_REPO}\n` +
				`  VN_ENGINE_REPO=${process.env.VN_ENGINE_REPO ?? '(unset)'}\n` +
				'  An engine was named explicitly but it is not a usable checkout.',
		);
		process.exit(1);
	}
	console.log(
		`check-engine-timestamp: not applicable - no engine checkout at ${ENGINE_REPO}.\n` +
			'  The engine resolves from node_modules (the published package), which cannot be\n' +
			'  stale relative to this widget. Set VN_ENGINE_REPO to check a checkout instead.',
	);
	process.exit(0);
}

for (const pkg of PACKAGES) {
	const pkgDir = path.join(ENGINE_REPO, 'packages', pkg);
	const srcDir = path.join(pkgDir, 'src');
	const distDir = path.join(pkgDir, 'dist');

	if (!fs.existsSync(srcDir)) {
		console.log(`  FAIL ${pkg}: no src/ under ${pkgDir} - this is not a usable engine checkout`);
		hardFail = true;
		continue;
	}
	if (!fs.existsSync(distDir)) {
		console.log(`  FAIL ${pkg}: dist/ does not exist - a rebuild is required (AGENTS.md Rule 13)`);
		hardFail = true;
		continue;
	}
	if (!hasBundle(distDir)) {
		console.log(`  FAIL ${pkg}: dist/ exists but holds no bundle - rebuild required`);
		hardFail = true;
		continue;
	}

	const srcM = newestMtime(srcDir, ['.ts', '.tsx']);
	const distM = newestMtime(distDir, ['.js', '.cjs', '.mjs']);
	if (distM < srcM) {
		warned++;
		console.log(`  WARN ${pkg}: dist/ mtime is older than src/ (${new Date(srcM).toISOString()} > ${new Date(distM).toISOString()})`);
		console.log(`       Not proof of staleness — a checkout moves mtimes without changing code, and dist/ is gitignored.`);
		console.log(`       If you changed engine source, rebuild: cd ../vninvestcharts-engine && npm run build`);
	} else {
		console.log(`  OK   ${pkg}: dist/ present and no older than src/`);
	}
}

if (hardFail) {
	console.error('\nA rebuild is definitely required. Run: cd ../vninvestcharts-engine && npm run build');
	process.exit(1);
}
if (warned > 0) {
	console.log(`\n${warned} package(s) carry an mtime warning. Review each one by hand; this script cannot decide it.`);
} else {
	console.log('\nAll engine packages have a dist/ and no staleness signal.');
}
process.exit(0);
