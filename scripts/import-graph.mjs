import fs from "node:fs";
import path from "node:path";

const ROOT = process.argv[2] ?? ".";
const TARGET = process.argv[3];

const EXT = [".ts", ".tsx"];
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);

function* walk(dir) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const e of entries) {
		if (e.isDirectory()) {
			if (SKIP.has(e.name)) continue;
			yield* walk(path.join(dir, e.name));
		} else if (EXT.includes(path.extname(e.name))) {
			yield path.join(dir, e.name);
		}
	}
}

const files = [...walk(ROOT)];
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");

/** Resolve a module specifier to a repo file, or null. */
function resolveSpec(fromFile, spec) {
	if (!spec.startsWith(".")) return null;
	const base = path.resolve(path.dirname(fromFile), spec);
	for (const e of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
		const cand = base + e;
		if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
	}
	return null;
}

const IMPORT_RE = /(?:^|[\s;{}()])(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

const edges = new Map(); // file -> Set(importer)
const all = files.map((f) => [f, fs.readFileSync(f, "utf8")]);

for (const [file, src] of all) {
	const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
	let m;
	IMPORT_RE.lastIndex = 0;
	while ((m = IMPORT_RE.exec(stripped)) !== null) {
		const spec = m[1] ?? m[2];
		const target = resolveSpec(file, spec);
		if (!target) continue;
		const targetKey = rel(target);
		if (!edges.has(targetKey)) edges.set(targetKey, new Set());
		edges.get(targetKey).add(rel(file));
	}
}

/** Reverse reachability: all files that transitively import `target`. */
function reverseClosure(targetRel) {
	const seen = new Set();
	const queue = [targetRel];
	while (queue.length) {
		const cur = queue.pop();
		for (const importer of edges.get(cur) ?? []) {
			if (!seen.has(importer)) {
				seen.add(importer);
				queue.push(importer);
			}
		}
	}
	return seen;
}

const targetAbs = path.resolve(ROOT, TARGET);
const targetRel = rel(targetAbs);
const importers = reverseClosure(targetRel);

console.log(`target: ${targetRel}`);
console.log(`files scanned: ${files.length}`);
console.log(`reverse-reachable importers: ${importers.size}`);
for (const i of [...importers].sort()) console.log(`  ${i}`);