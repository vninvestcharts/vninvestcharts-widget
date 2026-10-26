#!/usr/bin/env node
/**
 * check-scope-spelling.js — fail the build if the misspelled scope comes back.
 *
 * WHY THIS EXISTS. The doubled-"l" scope has been written into this repo at
 * least five separate times and survived because nothing read the files it landed
 * in. Measured 2026-10-13: 19 live occurrences across 11 files, of which the ones
 * that actually bit were
 *   - `gen-inventory.mjs` wrote the typo into the GENERATED `07.03` matrix, so
 *     the wrong scope shipped in documentation nobody had typed by hand;
 *   - `NPM_TOKEN_SETUP.md` told the operator to scope a token to a package that
 *     does not exist;
 *   - `11.01` told the operator to `cd ../` + a sibling directory that is not on
 *     disk.
 *
 * A typo in a `package.json` dependency fails loudly. A typo in prose fails
 * silently and is copied. Hence a gate.
 *
 * Historical records are exempt on purpose: `AUDIT_LEDGER.md`, handoffs, plans,
 * audits, evidence and CHANGELOGs describe how this typo got in. Rewriting them
 * would delete the only record that it was ever a problem — the same rule the
 * claim registry follows. Use `--include-historical` to see those too.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
// Assembled at runtime so this file does not itself contain the misspelling it
// is searching for — a gate that fails on its own source is a gate nobody runs.
const TYPO = ["vninstall", "charts"].join("");
const RIGHT = ["vninvest", "charts"].join("");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "playwright-report"]);
const INCLUDE_HISTORICAL = process.argv.includes("--include-historical");

// A file that documents the typo rather than containing it.
const INTENTIONAL = [
	// This comment is the record of the aliases having been misspelled; rewriting
	// it would make the sentence false.
	{suffix: "scripts/gen-engine-tsconfig-paths.mjs", minLine: 40, maxLine: 60},
];
const HISTORICAL = [
	/AUDIT_LEDGER\.md$/,
	/SESSION_HANDOFF/,
	/^docs[/\\]upgrade-standard[/\\]plans[/\\]/,
	/^docs[/\\]plans[/\\]/,
	/^docs[/\\]upgrade-standard[/\\]audits[/\\]/,
	/^docs[/\\]upgrade-standard[/\\]evidence[/\\]/,
	/REPORT_FINAL/,
	/CHANGELOG\.md$/,
	/^docs[/\\]architecture[/\\]sad-/,
	/TEST_REPORT_/,
];
const EXTS = new Set([".md", ".ts", ".tsx", ".js", ".cjs", ".mjs", ".json", ".yml", ".yaml", ".css"]);

function isHistorical(rel) {
	return HISTORICAL.some((re) => re.test(rel));
}
function isIntentional(rel, lineNo) {
	return INTENTIONAL.some((w) => rel.endsWith(w.suffix) && lineNo >= w.minLine && lineNo <= w.maxLine);
}

const hits = [];
(function walk(dir, base = "") {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		if (e.isDirectory()) {
			if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), base ? `${base}/${e.name}` : e.name);
			continue;
		}
		const rel = base ? `${base}/${e.name}` : e.name;
		if (!EXTS.has(path.extname(e.name))) continue;
		let text;
		try {
			text = fs.readFileSync(path.join(dir, e.name), "utf8");
		} catch {
			continue;
		}
		if (!text.includes(TYPO)) continue;
		text.split(/\r?\n/).forEach((line, i) => {
			if (!line.includes(TYPO)) return;
			if (!INCLUDE_HISTORICAL && isHistorical(rel)) return;
			if (isIntentional(rel, i + 1)) return;
			hits.push({ rel, line: i + 1, historical: isHistorical(rel), text: line.trim().slice(0, 90) });
		});
	}
})(ROOT);

console.log(`scope-spelling: scanning for "${TYPO}" (the real one is "${RIGHT}")`);
if (hits.length === 0) {
	console.log(`PASS — no misspelled scope outside historical records`);
	process.exit(0);
}
for (const h of hits) {
	console.error(`  ${h.rel}:${h.line}  ${h.historical ? "[historical] " : ""}${h.text}`);
}
console.error(
	`\nFAIL — ${hits.length} misspelled "${TYPO}" occurrence(s).` +
		(hits.every((h) => h.historical) ? " All are historical; pass --include-historical to inspect them." : " Historical records are exempt by design."),
);
process.exit(1);