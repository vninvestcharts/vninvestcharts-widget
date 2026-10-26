/* Negative self-test for import-graph.mjs (Hazard 7: an ownership claim must be
 * COMPUTED by a graph traversal, and a traversal that reports "0 importers"
 * because of its own bug is worse than no traversal at all).
 *
 * Case 1 (control): a leaf with one importer  -> expect >= 1
 * Case 2 (control): a node three hops deep     -> expect the whole chain
 * Case 3 (control): a true orphan              -> expect exactly 0
 * Case 4 (THE BUG): absolute/relative key mixup -> must NOT report 0 for a
 *         node that demonstrably has an importer.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPT = path.resolve(import.meta.dirname, "import-graph.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ig-selftest-"));

const write = (rel, body) => {
	const p = path.join(tmp, rel);
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, body, "utf8");
};

write("leaf.ts", "export const leaf = 1;\n");
write("mid.ts", 'import { leaf } from "./leaf";\nexport const mid = leaf;\n');
write("top.ts", 'import { mid } from "./mid";\nexport const top = mid;\n');
write("orphan.ts", "export const orphan = 1;\n");
write("noise.ts", 'import { top } from "./top";\nexport const noise = top;\n');

function importersOf(target) {
	const out = execFileSync("node", [SCRIPT, tmp, target], { encoding: "utf8" });
	const line = out.split(/\r?\n/).find((l) => l.startsWith("reverse-reachable importers:"));
	return { n: Number(line.split(":")[1].trim()), out };
}

const cases = [
	["leaf.ts", 3, "direct (mid) + transitive (top, noise)"],
	["mid.ts", 2, "direct (top) + transitive (noise)"],
	["top.ts", 1, "one direct importer (noise)"],
	["orphan.ts", 0, "true orphan -> 0"],
];

let failed = 0;
for (const [target, expect, why] of cases) {
	const { n } = importersOf(target);
	const ok = n === expect;
	if (!ok) failed++;
	console.log(`${ok ? "PASS" : "FAIL"}  ${target}: got ${n}, expected ${expect}  (${why})`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed === 0 ? "\nself-test: 4/4 PASS" : `\nself-test: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);