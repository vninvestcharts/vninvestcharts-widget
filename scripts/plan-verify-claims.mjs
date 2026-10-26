/**
 * Verify every file claim in the plan's slice table actually exists on disk.
 *
 * The plan records FIVE separate times that this table was wrong - wrong
 * directory, invented paths, generated outputs claimed as source. So the table is
 * treated as a claim, not as truth, and re-measured here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAN = path.join(ROOT, "docs/upgrade-standard/plans/PLAN_B2B_WIDGET_2026-10-06.md");

// S5 closed 2026-10-07 (netPnl invariant). B5 and B17 were withdrawn as false
// positives - see PLAN_BACKLOG_SPLIT_2026-10-07 Phan A2 - so they are counted as
// closed rather than remaining. S2's LICENSE.md claim is stale by design: that
// duplicate was deleted in S2 and LICENSE is now the only licence file.
const DONE = new Set(["S0", "S1", "S2", "S3", "S29", "S31", "S5"]);

const src = fs.readFileSync(PLAN, "utf8");
const rows = [];
for (const line of src.split("\n")) {
	const m = line.match(/^\|\s*\*\*S(\d+)\*\*\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|/);
	if (!m) continue;
	const [, num, layer, prio, dep, size, files, owner] = m;
	const id = `S${num}`;
	rows.push({
		id,
		layer: layer.trim(),
		prio: prio.trim(),
		dep: dep.trim(),
		size: size.trim(),
		owner: owner.trim(),
		files: files
			.trim()
			.split(/,\s*/)
			.map((f) => f.replace(/`/g, "").trim())
			.filter(Boolean),
	});
}

const out = [];
for (const r of rows) {
	const missing = r.files.filter((f) => !fs.existsSync(path.join(ROOT, f)));
	out.push({ ...r, missing, done: DONE.has(r.id) });
}

console.log(`rows parsed: ${out.length}`);
console.log(`already done: ${out.filter((r) => r.done).length}`);
console.log(`remaining:    ${out.filter((r) => !r.done).length}`);
console.log("");

const DENY = [
	/^config\/.*\.json$/,
	/^package\.json$/,
	/^CHANGELOG\.md$/,
	/^docs\/CLAIMS\.md$/,
	/^docs\/upgrade-standard\/AUDIT_LEDGER\.md$/,
	/^tsconfig\.json$/,
	/LICENSE/,
	/^src\/demo\/i18n\.tsx$/,
	/^README\.md$/,
];

console.log("=== MISSING PATHS (plan claims a file that is not there) ===");
let missingTotal = 0;
for (const r of out) {
	if (!r.missing.length) continue;
	missingTotal += r.missing.length;
	for (const m of r.missing) console.log(`  ${r.id}  ${m}`);
}
console.log(missingTotal === 0 ? "  (none)" : `  total: ${missingTotal}`);
console.log("");

console.log("=== DENY-LISTED files claimed by a non-coordinator slice ===");
for (const r of out) {
	if (r.owner !== "worker") continue;
	for (const f of r.files) {
		if (DENY.some((d) => d.test(f))) console.log(`  ${r.id} (worker) claims deny-listed ${f}`);
	}
}
console.log("");

// Pairwise overlap among REMAINING slices only - two live workers on one file is
// Hazard 1 by construction.
console.log("=== FILE OVERLAP between remaining slices ===");
const live = out.filter((r) => !r.done);
const byFile = new Map();
for (const r of live) {
	for (const f of r.files) {
		if (!byFile.has(f)) byFile.set(f, []);
		byFile.get(f).push(r.id);
	}
}
let overlaps = 0;
for (const [f, ids] of byFile) {
	if (ids.length > 1) {
		overlaps += 1;
		console.log(`  ${f}  <- ${ids.join(", ")}`);
	}
}
console.log(overlaps === 0 ? "  (none - all remaining file sets are disjoint)" : `  total: ${overlaps}`);
console.log("");

console.log("=== remaining by layer ===");
const byLayer = new Map();
for (const r of live) {
	if (!byLayer.has(r.layer)) byLayer.set(r.layer, []);
	byLayer.get(r.layer).push(r.id);
}
for (const [layer, ids] of [...byLayer].sort()) console.log(`  ${layer}: ${ids.join(" ")}`);

console.log("");
console.log("=== size mix (remaining) ===");
const bySize = new Map();
for (const r of live) bySize.set(r.size, (bySize.get(r.size) ?? 0) + 1);
for (const [s, n] of bySize) console.log(`  ${s}: ${n}`);

console.log("");
console.log("=== engine-repo slices (twin repo, Rule 13) ===");
for (const m of src.matchAll(/^### (E\d)\s*-\s*(.+)$/gm)) console.log(`  ${m[1]}  ${m[2].slice(0, 70)}`);