// Reliable recursive symbol grep. PowerShell's -Path "src/**/*.ts" under-reports
// (it does not expand ** as expected), which produced a FALSE "0 callers" finding
// for src/widget/utils/coordinateBridge.ts. This walks the tree with readdirSync.
//
// Usage: node <repo-root> <regex> [--include-ext=.ts,.tsx] [--exclude-dir=node_modules,...]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const [ROOT, pattern] = process.argv.slice(2);
const args = process.argv.slice(4);
const extArg = args.find((a) => a.startsWith("--include-ext="));
const dirArg = args.find((a) => a.startsWith("--exclude-dir="));
const EXTS = new Set(
	(extArg ? extArg.slice("--include-ext=".length) : ".ts,.tsx,.js,.jsx,.cjs,.mjs")
		.split(",")
		.map((e) => (e.startsWith(".") ? e : `.${e}`)),
);
const SKIPDIRS = new Set(
	(dirArg ? dirArg.slice("--exclude-dir=".length) : "node_modules,.git,dist,build,coverage,.next")
		.split(","),
);

const re = new RegExp(pattern);
let scanned = 0;
const hits = [];
function* walk(dir) {
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return;
	}
	for (const name of entries) {
		const abs = join(dir, name);
		if (SKIPDIRS.has(name)) continue;
		let st;
		try {
			st = statSync(abs);
		} catch {
			continue;
		}
		if (st.isDirectory()) yield* walk(abs);
		else if (EXTS.has(extname(abs))) yield abs;
	}
}
for (const f of walk(ROOT)) {
	scanned += 1;
	const src = readFileSync(f, "utf8");
	const lines = src.split(/\r?\n/);
	lines.forEach((line, i) => {
		if (re.test(line)) {
			hits.push({
				file: relative(ROOT, f).replace(/\\/g, "/"),
				line: i + 1,
				text: line.trim().slice(0, 160),
			});
		}
	});
}
console.log(`scanned ${scanned} file(s), exts=[${[...EXTS].join(",")}], skip=[${[...SKIPDIRS].join(",")}]`);
console.log(`MATCHES: ${hits.length}\n`);
const byFile = new Map();
for (const h of hits) {
	if (!byFile.has(h.file)) byFile.set(h.file, []);
	byFile.get(h.file).push(h);
}
for (const [file, list] of [...byFile].sort()) {
	console.log(`${file}  (${list.length})`);
	for (const h of list) console.log(`  ${h.line}: ${h.text}`);
}