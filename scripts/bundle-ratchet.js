#!/usr/bin/env node
/**
 * bundle-ratchet.js — VER-02: make bundle size an actionable gate.
 *
 * `check-bundle-size.js` compares against the *target* limits, and two bundles
 * are over them: IIFE 666.72/600 and CJS 456.35/350 kB gzip (the committed
 * sizes in config/bundle-baseline.json). ESM was 471/350 and has since shrunk
 * to 284.2/350, so it is now UNDER target. CI runs the absolute check with
 * `continue-on-error: true` - a permanently
 * red step that nobody can act on.
 *
 * This script commits the CURRENT sizes as a baseline and fails only when a
 * bundle grows. Shrinking is rewarded, and the gap to the real target is still
 * printed so the reduction stays visible.
 *
 * Usage:
 *   node scripts/bundle-ratchet.js            # enforce (CI)
 *   node scripts/bundle-ratchet.js --update   # rewrite baseline after shrinking
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const BASELINE = path.join(ROOT, 'config', 'bundle-baseline.json');
const UPDATE = process.argv.includes('--update');

const LABELS = {
	'dist/vninvestchart.iife.js': 'IIFE',
	'dist/index.js': 'ESM',
	'dist/index.cjs': 'CJS',
	'dist/iframe-host/host-entry.js': 'iframe-host ESM',
};

if (!fs.existsSync(BASELINE)) {
	console.error('bundle-ratchet FAIL: config/bundle-baseline.json missing');
	process.exit(1);
}
const config = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
// Targets are read from the same config so the ratchet and
// scripts/check-bundle-size.js can never drift into disagreeing about the goal.
const TARGETS = Object.entries(config.targets || {}).map(([file, targetKB]) => ({
	file,
	label: LABELS[file] || file,
	targetKB,
}));

const gzipKB = (abs) => zlib.gzipSync(fs.readFileSync(abs)).length / 1024;
const round = (n) => Math.round(n * 100) / 100;

const measured = {};
const missing = [];
for (const t of TARGETS) {
	const abs = path.join(ROOT, t.file);
	if (!fs.existsSync(abs)) {
		missing.push(t.file);
		continue;
	}
	measured[t.file] = round(gzipKB(abs));
}

if (missing.length > 0 && !UPDATE) {
	console.error('bundle-ratchet FAIL: expected artifact(s) missing — run `npm run build` first:');
	for (const m of missing) console.error(`  - ${m}`);
	process.exit(1);
}

if (UPDATE) {
	const payload = { ...config, sizes: measured };
	fs.writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
	console.log(`bundle-ratchet: baseline written — ${Object.entries(measured).map(([f, k]) => `${path.basename(f)}=${k}KB`).join(', ')}`);
	process.exit(0);
}

const base = config.sizes || {};
const problems = [];
const notes = [];

for (const t of TARGETS) {
	const cur = measured[t.file];
	if (cur === undefined) continue;
	const was = base[t.file];
	if (typeof was !== 'number') {
		notes.push(`${t.label}: no baseline — run with --update to record`);
		continue;
	}
	const delta = round(cur - was);
	if (delta > 0) {
		problems.push(`${t.label} (${t.file}) grew ${was}KB → ${cur}KB (+${delta}KB). Shrink it, or (legit trade-off) run: node scripts/bundle-ratchet.js --update`);
	}
	const overTarget = cur > t.targetKB;
	notes.push(
		`${delta === 0 ? '=0' : delta < 0 ? `-${Math.abs(delta)}` : `+${delta}`}KB vs baseline; ${overTarget ? `still ${round(cur - t.targetKB)}KB over the ${t.targetKB}KB target` : `under the ${t.targetKB}KB target`}`
	);
}

for (const n of notes) console.log(`  ${n}`);

if (problems.length > 0) {
	console.error('\nbundle-ratchet FAIL:\n' + problems.map((p) => `  * ${p}`).join('\n'));
	process.exit(1);
}

const total = round(Object.values(measured).reduce((a, b) => a + b, 0));
console.log(`\nbundle-ratchet PASS: ${total}KB gzip across ${Object.keys(measured).length} bundle(s).`);
