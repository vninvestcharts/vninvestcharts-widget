#!/usr/bin/env node
/**
 * scan-legacy-union.mjs — count every `"legacy" | "fork"` union still in the tree.
 *
 * Usage:
 *   node scripts/scan-legacy-union.mjs            # scans <repo>/src (default)
 *   node scripts/scan-legacy-union.mjs src        # same
 *   node scripts/scan-legacy-union.mjs <dir>      # explicit root
 *
 * AC-8 runs the no-argument form and expects `UNION SITES: 0`.
 *
 * Two design rules, both added after an audit caught the alternative:
 *
 *  1. The default root is `<repo>/src`, NOT the repo root. With the repo root as
 *     default the walker read its own header comment — which literally contains
 *     `"legacy" | "fork"` — and reported `UNION SITES: 12` instead of 11. AC-8 could
 *     then never return 0, so a worker would have had to edit the instrument to make
 *     its own gate green. That is the hazard-4 move; do not reintroduce it.
 *  2. SELF is excluded unconditionally, so the result never depends on the cwd.
 *
 * Counting rule: a quoted `legacy` and a quoted `fork` on the SAME line, separated by
 * `|`, in either order, with any quote style. Verified not to over-match: of ~300 lines
 * containing the substring `legacy` in src/, only the union declarations match.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = resolve(HERE, "scan-legacy-union.mjs");
const REPO = resolve(HERE, "..");

const arg = process.argv[2];
const ROOT = arg ? resolve(REPO, arg) : join(REPO, "src");

const SKIP = /node_modules|[\\/]\.git[\\/]|[\\/]dist[\\/]|[\\/]build[\\/]|[\\/]coverage[\\/]|[\\/]\.next[\\/]|[\\/]storybook-static[\\/]/;
const EXT = /\.(ts|tsx|cjs|mjs|js)$/;
const q = "['\"`]";
const UNION = new RegExp(
	`(?:${q}legacy${q}\\s*\\|\\s*${q}fork${q}|${q}fork${q}\\s*\\|\\s*${q}legacy${q})`,
);

function* walk(dir) {
	for (const name of readdirSync(dir)) {
		const abs = join(dir, name);
		if (SKIP.test(abs)) continue;
		if (resolve(abs) === SELF) continue;
		let st;
		try {
			st = statSync(abs);
		} catch {
			continue;
		}
		if (st.isDirectory()) yield* walk(abs);
		else if (EXT.test(name)) yield abs;
	}
}

let files = 0;
const hits = [];
for (const f of walk(ROOT)) {
	files += 1;
	readFileSync(f, "utf8")
		.split(/\r?\n/)
		.forEach((line, i) => {
			if (UNION.test(line)) {
				hits.push({
					file: relative(ROOT, f).replace(/\\/g, "/"),
					line: i + 1,
					text: line.trim(),
					kind: /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) ? "TEST" : "SRC",
				});
			}
		});
}

console.log(`root: ${ROOT}`);
console.log(`scanned ${files} file(s)`);
console.log(`UNION SITES: ${hits.length}\n`);
for (const h of hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
	console.log(`[${h.kind}] ${h.file}:${h.line}: ${h.text}`);
}

// Non-zero when sites remain, so this doubles as an enforcing gate (AC-8).
process.exit(hits.length === 0 ? 0 : 1);