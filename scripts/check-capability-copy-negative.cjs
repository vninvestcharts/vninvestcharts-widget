const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// Hazard 12: the author of a gate must not be the only one who has seen it pass.
// This injects a violation into the file the gate anchors on and requires the
// gate to go RED. It mutates a COPY-safe path and restores in `finally`
// (hazard 15: a harness that fails exactly when it works).
//
// ROOT is derived from __dirname, never hardcoded: a committed gate that only
// runs on the machine that wrote it is not a gate. (This exact bug shipped in
// the first version of this file and was caught by running it.)
const ROOT = path.join(__dirname, "..");
const TARGET = path.join(ROOT, "src/lib/pinescript/pineBuiltins.ts");
const GATE = path.join(ROOT, "scripts/check-capability-copy-claims.mjs");
const orig = fs.readFileSync(TARGET, "utf8");

// A paraphrase the gate author did not write: rename the exported dispatcher to
// something the anchor string no longer matches.
const mutated = orig.replace("export function callFunction(", "export function dispatchPineBuiltin(");
if (mutated === orig) {
	console.error("NEGATIVE TEST INCONCLUSIVE: anchor string not found, mutation was a no-op");
	process.exit(2);
}

let code = null;
let out = "";
try {
	fs.writeFileSync(TARGET, mutated, "utf8");
	try {
		out = execFileSync(process.execPath, [GATE], {
			cwd: ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		code = 0;
	} catch (err) {
		code = typeof err.status === "number" ? err.status : 1;
		out = String(err.stdout || "") + String(err.stderr || "");
	}
} finally {
	fs.writeFileSync(TARGET, orig, "utf8");
}

const restored = fs.readFileSync(TARGET, "utf8") === orig;
console.log("--- negative test: rename the anchor symbol ---");
console.log("exit=" + code);
console.log("output:", out.trim().split("\n").slice(-2).join(" | "));
console.log("restored byte-identical:", restored);

if (!restored) {
	console.error("FAIL: file NOT restored");
	process.exit(1);
}
if (code === 0) {
	console.error("FAIL: gate stayed GREEN with the anchor renamed - it verifies nothing");
	process.exit(1);
}
console.log("PASS: gate went RED on the injected violation and the file was restored.");