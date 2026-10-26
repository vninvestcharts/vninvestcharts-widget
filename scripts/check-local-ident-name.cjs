"use strict";
/* Validate every `localIdentName` pattern against the parser that actually
 * decides the pattern: esbuild-plugin-css-modules.
 *
 * Why this exists: `[hash:base64:5]` looks plausible and works on Windows, but the
 * plugin's grammar is `[hash:length:algorithm:digest]` (README, and
 * lib/helpers.js:20 `match1[1].split(":")`). So `base64` lands in the ALGORITHM
 * slot, and `5` in the digest slot. Both are invalid. The plugin only throws
 * when it has to rename a class (lib/index.js:93-95), so a run that renames
 * nothing exits 0 — which is why this survived in the repo and only surfaced
 * on a Linux runner building all 14 modules for the first time.
 *
 * Mirrors the plugin's own checks rather than inventing them:
 *   - algorithm must be one of SUPPORTED_HASHES  (helpers.js SUPPORTED_HASHES)
 *   - digest must be one of SUPPORTED_DIGESTS
 *   - length must parse as an integer            (index.js:101 parseInt(lengthRaw))
 *
 * Usage: node scripts/check-local-ident-name.cjs [files...]
 *        (no args scans the tracked build scripts)
 * Exit 0 = every pattern is valid. Exit 1 = at least one is not.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
/* The plugin accepts these four (helpers.js SUPPORTED_HASHES). md4 is the plugin's
 * own DEFAULT and appears in its README examples, so it is a trap: Node's OpenSSL
 * 3 build refuses it —
 *   error:0308010C:digital envelope routines::unsupported
 * — which is what failed the Linux CI build when the pattern was corrected to
 * `[hash:5:md4:base64]`. md4 is accepted here because the grammar allows it; the
 * runtime check below is what actually forbids it in this repo. */
const SUPPORTED_HASHES = ["md4", "md5", "sha256", "sha512"];
const SUPPORTED_DIGESTS = ["base64", "hex"];

/* Algorithms Node can actually instantiate. On OpenSSL 3 (Node 17+) md4 is gone.
 * ci.yml runs node 20/22, so md4 cannot be used even though the plugin allows it. */
const USABLE_HASHES = ["md5", "sha256", "sha512"];

const DEFAULT_TARGETS = [
	"build-css-modules-v2.js",
	"build-css-modules-complete.js",
	"build-css-modules-final.js",
	"build-css-modules.js",
	"build-esm-cjs.js",
	"test-css-modules.js",
];

/** Returns a list of problems for one pattern string. */
function validatePattern(pattern) {
	const errs = [];
	for (const token of pattern.match(/\[.+?\]/g) || []) {
		const parts = token.slice(1, -1).split(":");
		const [name, ...params] = parts;
		if (name !== "hash") continue;
		const [length, algorithm, digest] = params;
		if (algorithm !== undefined && !SUPPORTED_HASHES.includes(algorithm)) {
			errs.push(`slot 2 of [hash:...] is the ALGORITHM, got "${algorithm}" (supported: ${SUPPORTED_HASHES.join(", ")})`);
		} else if (algorithm !== undefined && !USABLE_HASHES.includes(algorithm)) {
			errs.push(
				`algorithm "${algorithm}" is accepted by the plugin but unusable on OpenSSL 3 / Node 17+ ` +
					`(error:0308010C) — ci.yml runs node 20/22. Use one of: ${USABLE_HASHES.join(", ")}`,
			);
		}
		if (digest !== undefined && !SUPPORTED_DIGESTS.includes(digest)) {
			errs.push(`slot 3 of [hash:...] is the DIGEST, got "${digest}" (supported: ${SUPPORTED_DIGESTS.join(", ")})`);
		}
		if (length !== undefined && !/^\d+$/.test(length)) {
			errs.push(`slot 1 of [hash:...] is the LENGTH and must be numeric, got "${length}"`);
		}
	}
	return errs;
}

const targets = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_TARGETS;
let bad = 0;
let checked = 0;

for (const rel of targets) {
	const abs = path.resolve(ROOT, rel);
	if (!fs.existsSync(abs)) {
		console.log(`SKIP  ${rel} (not present)`);
		continue;
	}
	const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
	lines.forEach((line, i) => {
		const m = line.match(/localIdentName:\s*['"]([^'"]+)['"]/);
		if (!m) return;
		checked++;
		const pattern = m[1];
		const errs = validatePattern(pattern);
		if (errs.length) {
			bad++;
			console.log(`BAD   ${rel}:${i + 1}  localIdentName: '${pattern}'`);
			for (const e of errs) console.log(`        - ${e}`);
		} else {
			console.log(`ok    ${rel}:${i + 1}  '${pattern}'`);
		}
	});
}

console.log("");
console.log(`${checked} pattern(s) checked, ${bad} invalid`);
if (bad) {
	console.log("The plugin only throws when it renames a class, so an invalid pattern can pass locally.");
	console.log(
		`Fix: [hash:length:algorithm:digest] with an algorithm Node can instantiate, e.g. [hash:5:${USABLE_HASHES[1]}:base64].`,
	);
}
process.exit(bad ? 1 : 0);