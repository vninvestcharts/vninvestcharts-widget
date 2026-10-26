// BL-05: ratchet gate for `as any` in non-test source.
// Baseline 2026-09-24: 293 matches (widget+lib, excluding *.test.*,
// counted by THIS script — line-based greps undercount multi-cast lines).
// Lower MAX_ANY whenever a batch lands; big engine-boundary conversions
// need twin-repo type alignment (Phase 3), NOT blind casts removal.
//
// H0.17 (2026-10-03): src/demo added to the roots. It was never read before, so
// "278 <= 293 PASS" was a statement about two thirds of the source tree. Measured
// contribution of src/demo: 28. New MAX_ANY = 306.
//
// The ratchet only means something if the thing it measures actually covers the
// thing we care about, so the scope was widened BEFORE the number was raised. A
// higher bar over more files is a weaker gate passing, not a stricter one.
const fs = require("fs");
const path = require("path");

const MAX_ANY = Number(process.env.ANY_MAX || 306);
const roots = ["src/widget", "src/lib", "src/demo"];
const pattern = /as\s+any\b/g;

function walk(currentPath, files) {
	const entries = fs.readdirSync(currentPath, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") continue;
		const nextPath = path.join(currentPath, entry.name);
		if (entry.isDirectory()) {
			walk(nextPath, files);
			continue;
		}
		if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
			files.push(nextPath);
		}
	}
}

function main() {
	const rootDir = path.resolve(__dirname, "..");
	const files = [];
	for (const root of roots) {
		walk(path.join(rootDir, root), files);
	}
	let total = 0;
	for (const filePath of files) {
		const content = fs.readFileSync(filePath, "utf8");
		const matches = content.match(pattern);
		if (matches) total += matches.length;
	}
	console.log(`non-test 'as any': ${total} (max ${MAX_ANY})`);
	if (total > MAX_ANY) {
		console.error(`any-count check failed: ${total} > ${MAX_ANY}. Convert casts with real types or bump MAX_ANY with a ledger entry.`);
		process.exitCode = 1;
	}
}

main();
