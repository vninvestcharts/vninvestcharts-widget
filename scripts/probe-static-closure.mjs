#!/usr/bin/env node
/**
 * AC-1.4 probe for PRO-EXTRACT-2026-10-15.
 *
 * Walks the STATIC import closure of dist/index.js, reads every reachable chunk's sourcemap
 * `sources[]`, and asserts that no PineScript module is inside it — except the two that are
 * deliberately allowed to stay.
 *
 * Why CONTENT and not FILENAME: chunk file names are content hashes, so any edit renames them.
 * Asserting on `chunk-WEOCW7PJ.js` would either fail for the wrong reason or — worse — pass
 * vacuously while the compiler simply moved to a renamed chunk. This probe looks at what the
 * chunks actually CONTAIN.
 *
 * Why `sources[]` and not `sourcesContent[]`: `sourcesContent` embeds whole files including
 * comments, and `pineReassign.ts:22` mentions `pineStrategy` in prose. Grepping the raw map
 * therefore reports false positives.
 *
 * Allowlist (both verified on disk):
 *   ast.ts          — exports only types; erased at compile time, zero emitted bytes
 *   PineCompiler.ts — a ~35-line plugin Map after the D-15 cut; 0 imports, pulls in no compiler
 *
 * EXIT: 0 pass, 1 fail, 2 usage.
 */
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve(import.meta.dirname, "..", "dist");
const ENTRY = path.join(DIST, "index.js");

/** Files allowed to remain in the static closure, with the reason they are safe. */
const ALLOWED = new Map([
	["src/lib/pinescript/ast.ts", "type-only module, erased at compile time"],
	["src/lib/pinescript/PineCompiler.ts", "plugin Map only, 0 imports, pulls in no compiler"],
]);

const DENY_DIR = "src/lib/pinescript/";

function staticImports(src) {
	// Static import/export-from edges only. Dynamic import() is deliberately NOT followed: that
	// is exactly the boundary this probe is trying to prove exists.
	const out = [];
	for (const m of src.matchAll(/import\s*[^;]*?from\s*["'](\.[^"']+)["']/g)) out.push(m[1]);
	for (const m of src.matchAll(/export\s*[^;]*?from\s*["'](\.[^"']+)["']/g)) out.push(m[1]);
	return out;
}

function main() {
	// `--entry <file>` lets the same detector be pointed at any bundle. It exists so the detector
	// can be shown to be non-blind: Phase 1 deliberately does NOT fix the IIFE (splitting:false),
	// so `vninvestchart.iife.js` still contains the compiler — and the probe reporting it there is
	// the fail-before evidence that the detector fires when pine really is in the graph.
	const entryArg = process.argv.indexOf("--entry");
	const entryFile = entryArg >= 0 ? path.resolve(process.cwd(), process.argv[entryArg + 1]) : ENTRY;
	const expectClean = !process.argv.includes("--expect-dirty");

	if (!fs.existsSync(entryFile)) {
		console.error(`probe-static-closure: no ${entryFile} — run \`npm run build\` first.`);
		process.exitCode = 2;
		return;
	}

	const visited = new Set();
	const queue = [entryFile];
	const offenders = [];
	const allowedHits = [];
	let chunkCount = 0;

	while (queue.length) {
		const file = queue.pop();
		if (visited.has(file) || !fs.existsSync(file)) continue;
		visited.add(file);
		chunkCount++;

		const src = fs.readFileSync(file, "utf8");
		for (const spec of staticImports(src)) {
			queue.push(path.resolve(path.dirname(file), spec));
		}

		const mapFile = file + ".map";
		if (!fs.existsSync(mapFile)) continue;
		let map;
		try {
			map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
		} catch {
			console.warn(`  (unreadable sourcemap: ${path.basename(mapFile)} — treated as opaque)`);
			continue;
		}
		for (const s of map.sources ?? []) {
			// Normalise "../src/..." -> "src/..."
			const norm = s.replace(/^(\.\.\/)+/, "").replace(/^(\.\/)+/, "").split("\\").join("/");
			if (!norm.startsWith(DENY_DIR)) continue;
			if (ALLOWED.has(norm)) allowedHits.push(norm);
			else offenders.push({ chunk: path.basename(file), source: norm });
		}
	}

	console.log(`probe-static-closure: walked ${chunkCount} chunk(s) from ${path.relative(process.cwd(), entryFile) || entryFile}.`);
	if (allowedHits.length) {
		console.log(`  allowlisted (expected): ${[...new Set(allowedHits)].join(", ")}`);
	}
	if (offenders.length) {
		console.error(`FAIL: PineScript modules are still inside the STATIC closure (${offenders.length}):`);
		for (const o of offenders) console.error(`  * ${o.source}  (via ${o.chunk})`);
		process.exitCode = expectClean ? 1 : 0;
		if (!expectClean) console.log("(reported, not failed: --expect-dirty)");
		return;
	}
	console.log("PASS: no PineScript module (beyond the allowlist) is reachable from the ESM entry.");
	process.exitCode = 0;
}

main();