#!/usr/bin/env node
/**
 * check-build-entries.cjs — one build-entry source of truth, and a gate that keeps tools honest.
 *
 * WHAT THIS GUARDS (and why it is not the same as "read the docs"):
 * Every published entry point is DERIVED from the build config by `build-entries.cjs`
 * (tsup.config.ts + build-esm-cjs.js + build-all.js + package.json#exports). This gate then
 * checks four consequences:
 *
 *   C1  every derived entry's source file exists on disk            (MISSING_ENTRY)
 *   C2  the root entry agrees across three independent witnesses    (src/index.ts class)
 *   C3  a hand-written list that names ANY published entry must name ALL of them
 *       (the check-pine-dead.mjs class: rooted at a file that is not shipped, so it silently
 *        measured the wrong graph while printing PASS)
 *   C4  every path in such a list exists on disk                      (MISSING_ENTRY)
 *   C5  a hand-written `subpath -> file` map equals the derived set   (check-semver-breaking.mjs
 *       class: it duplicated the subpath list by hand while its own docblock claimed the list
 *       "is derived from package.json rather than hardcoded")
 *
 * The rules are written over CONSEQUENCES, never over the wording any one author chose
 * (hazard 12): a tool is judged by the SET it names, not by any sentence about it.
 *
 * Usage:
 *   node scripts/check-build-entries.cjs
 *   node scripts/check-build-entries.cjs --root <dir>     # used by --self-test on a copy
 *   node scripts/check-build-entries.cjs --self-test       # proves the rules actually bite
 *
 * LIMITATION, stated so nobody trusts it for more than it is: this cannot catch a root list
 * that names a file which exists but is still not a published entry (a hand-added component
 * root). It catches existence, coverage, and derived-set drift. Code review covers the rest.
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SELF_TEST = process.argv.includes("--self-test");
const ROOT_ARG = process.argv.indexOf("--root");
const ROOT = path.resolve(ROOT_ARG === -1 ? path.join(__dirname, "..") : process.argv[ROOT_ARG + 1]);

const ENTRY_LIST_NAME = /(?:^|_)(ENTRIES|ROOTS|ENTRY_FILES|entryFiles)$/;

/** This file is excluded from its own scan: its --self-test fixtures are deliberately malformed
 *  entry lists, and a gate that reads its own test data is measuring its matcher (hazard: the
 *  reverted S4 "orphan-surface detector" that reported 22/22 then 20/22 of its own making). */
const SELF_FILE = "scripts/check-build-entries.cjs";

/** Every string array literal in the repo assigned to an entries/roots-style name. */
function findEntryLists(root) {
	const found = [];
	const walk = (dir) => {
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			if (["node_modules", ".git", "dist", "build", "coverage", ".next"].includes(e.name)) continue;
			const abs = path.join(dir, e.name);
			if (e.isDirectory()) {
				walk(abs);
				continue;
			}
			if (!/\.(c?m?js|jsx|ts|tsx)$/.test(e.name)) continue;
			const rel = path.relative(root, abs).replace(/\\/g, "/");
			if (rel === SELF_FILE) continue;
			const src = fs.readFileSync(abs, "utf8");
			const declRe = /(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*(?::[^=\n]+)?=[ \t]*(\[[\s\S]*?\]);/g;
			let m;
			while ((m = declRe.exec(src))) {
				if (!ENTRY_LIST_NAME.test(m[1])) continue;
				// A `{ subpath, file }` map is governed by C5, not C3/C4: it lists SUBPATHS
				// (which are keys, not files) and deliberately omits the bundles that ship as
				// files rather than subpaths. Judging it by C3 would demand entries it must not
				// have.
				if (/subpath:[ \t]*'/.test(m[2])) continue;
				const items = [...m[2].matchAll(/(['"])([^'"]+)\1/g)].map((x) => x[2]);
				if (items.length) {
					found.push({ file: rel, name: m[1], items });
				}
			}
		}
	};
	walk(root);
	return found;
}

/** Every `{ subpath, file }` object array — a duplicated published-subpath map. */
function findSubpathMaps(root) {
	const found = [];
	const walk = (dir) => {
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			if (["node_modules", ".git", "dist", "build", "coverage", ".next"].includes(e.name)) continue;
			const abs = path.join(dir, e.name);
			if (e.isDirectory()) {
				walk(abs);
				continue;
			}
			if (!/\.(c?m?js|jsx|ts|tsx)$/.test(e.name)) continue;
			const rel = path.relative(root, abs).replace(/\\/g, "/");
			if (rel === SELF_FILE) continue;
			const src = fs.readFileSync(abs, "utf8");
			const declRe = /(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*(?::[^=\n]+)?=[ \t]*(\[[\s\S]*?\]);/g;
			let m;
			while ((m = declRe.exec(src))) {
				const pairs = [...m[2].matchAll(/subpath:[ \t]*'([^']+)'[^\n]*?file:[ \t]*'([^']+)'/g)];
				if (pairs.length) {
					found.push({
						file: rel,
						name: m[1],
						items: pairs.map((p) => ({ subpath: p[1], file: p[2] })),
					});
				}
			}
		}
	};
	walk(root);
	return found;
}

function loadDeriver(root) {
	const modulePath = path.join(root, "scripts", "build-entries.cjs");
	if (!fs.existsSync(modulePath)) throw new Error(`build-entries.cjs not found under ${root}`);
	delete require.cache[require.resolve(modulePath)];
	return require(modulePath);
}

function check(root) {
	const problems = [];
	const { publishedEntries, rootEntry } = loadDeriver(root);
	const entries = publishedEntries();
	const entryFiles = entries.map((e) => e.source);
	const subpaths = entries.filter((e) => e.subpath.startsWith(".")).map((e) => e.subpath);

	// C1 — every derived entry exists on disk.
	for (const e of entries) {
		if (!fs.existsSync(path.join(root, e.source))) {
			problems.push(`C1 MISSING_ENTRY  ${e.subpath} -> ${e.source} (declared by the build config, absent on disk)`);
		}
	}

	// C2 — three witnesses must agree on the root entry.
	const rootEntryDesc = rootEntry();
	if (!rootEntryDesc) {
		problems.push("C2 NO_ROOT  package.json#exports has no '.' subpath, so the root entry is undefined");
	} else {
		const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
		const typesField = pkg.types || "";
		const expectsPublicApi = typesField.includes("public-api");
		if (rootEntryDesc.source !== "src/public-api.ts") {
			problems.push(`C2 ROOT_DRIFT  root entry derived as ${rootEntryDesc.source}; dist/dts/public-api.d.ts (package.json#types) says the root is built from src/public-api.ts`);
		} else if (!expectsPublicApi) {
			problems.push(`C2 TYPES_DRIFT  package.json#types = ${typesField} no longer points at the public-api declaration`);
		}
	}

	// C3/C4 — hand-written lists that claim to be entry lists.
	const lists = findEntryLists(root);
	let listsJudged = 0;
	for (const list of lists) {
		const claimsToBeEntryList = list.items.some((item) => entryFiles.includes(item));
		if (!claimsToBeEntryList) continue; // some list of prefixes/components — not an entry list
		listsJudged++;
		const missing = entryFiles.filter((f) => !list.items.includes(f));
		if (missing.length) {
			problems.push(
				`C3 UNDER_COVERED  ${list.file} ${list.name} names ${list.items.filter((i) => entryFiles.includes(i)).length}/${entryFiles.length} published entries; missing: ${missing.join(", ")}`,
			);
		}
		const absent = list.items.filter(
			(item) => /\.(c?m?jsx?|tsx?)$/.test(item) && !fs.existsSync(path.join(root, item)),
		);
		if (absent.length) {
			problems.push(`C4 MISSING_PATH  ${list.file} ${list.name} lists paths that do not exist: ${absent.join(", ")}`);
		}
	}

	// C5 — hand-written subpath maps must equal the derived set.
	for (const map of findSubpathMaps(root)) {
		const mine = new Set(map.items.map((i) => i.subpath));
		const missing = subpaths.filter((s) => !mine.has(s));
		const extra = [...mine].filter((s) => !subpaths.includes(s));
		if (missing.length || extra.length) {
			problems.push(
				`C5 SUBPATH_DRIFT  ${map.file} ${map.name} maps ${mine.size} subpaths; missing ${missing.join(", ") || "(none)"}; unknown ${extra.join(", ") || "(none)"}`,
			);
		}
	}

	return { problems, entryCount: entryFiles.length, listsJudged, listsScanned: lists.length, subpathCount: subpaths.length };
}

/* ------------------------------------------------------------------ self-test */

function selfTest() {
	const results = [];
	const tmp = path.join(process.env.TEMP || require("node:os").tmpdir(), `cbe-selftest-${process.pid}`);

	/**
	 * Build a throwaway repo copy, write a fixture script, run the REAL gate as a child process.
	 * `expectCode` names the rule the case must trip: a negative case that fails for a DIFFERENT
	 * reason is not evidence that the rule works, so the code is asserted, not just the exit code.
	 */
	function runCase(name, fixtureBody, expectNonZero, expectCode, opts = {}) {
		fs.rmSync(tmp, { recursive: true, force: true });
		fs.mkdirSync(path.join(tmp, "scripts"), { recursive: true });
		for (const f of ["build-entries.cjs"]) {
			fs.copyFileSync(path.join(ROOT, "scripts", f), path.join(tmp, "scripts", f));
		}
		for (const f of ["package.json", "tsup.config.ts", "build-all.js", "build-esm-cjs.js"]) {
			fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
		}
		// The harness creates the tree, NOT the fixture: a fixture is scanned, never executed.
		for (const f of [...ALL, ...EXTRA_FILES]) {
			fs.mkdirSync(path.join(tmp, path.dirname(f)), { recursive: true });
			fs.writeFileSync(path.join(tmp, f), "export {};\n", "utf8");
		}
		if (opts.deleteEntry) fs.rmSync(path.join(tmp, opts.deleteEntry));
		fs.writeFileSync(path.join(tmp, "fixture.mjs"), fixtureBody, "utf8");

		const res = spawnSync(process.execPath, [path.join(__dirname, "check-build-entries.cjs"), "--root", tmp], {
			cwd: tmp,
			encoding: "utf8",
		});
		const full = `${res.stdout || ""}${res.stderr || ""}`;
		const nonZero = res.status !== 0;
		const problems = full.split("\n").filter((l) => /^\s*C[1-5]\s/.test(l));
		const codes = [...new Set(problems.map((l) => l.trim().slice(0, 2)))];
		const exitOk = nonZero === expectNonZero;
		const codeOk = expectCode ? codes.includes(expectCode) : codes.length === 0;
		results.push({
			name,
			expected: expectNonZero ? `FAIL on ${expectCode}` : "PASS, no problems",
			got: `exit=${res.status} codes=${codes.join(",") || "(none)"}`,
			verdict: exitOk && codeOk ? "OK" : "BROKEN",
			detail: problems[0] ? problems[0].trim() : "(no problem lines)",
		});
	}

	const ALL = [
		"src/public-api.ts",
		"src/widget/adapters/index.ts",
		"src/drawing-shim.ts",
		"src/lib/types/runtime.ts",
		"src/widget/iframe/host-entry.ts",
		"src/widget/iife-entry.ts",
		"src/widget/iframe/iframeEntry.tsx",
	];
	// Real repo files that are NOT published entries. A list may legitimately name them in
	// addition to the entries, so they must exist for C4 to stay honest.
	const EXTRA_FILES = ["src/demo/index.tsx", "src/widget/VNInvestCharts.tsx"];
	const quoted = ALL.map((f) => `"${f}"`).join(",");

	runCase("N1 under-covered list (names only the root entry)", `const ROOTS=["src/public-api.ts"];`, true, "C3");
	runCase("N2 list contains a path that is not on disk", `const ENTRIES=[${quoted},"src/index.ts"];`, true, "C4");
	runCase(
		"N3 subpath map missing ./types",
		`const SUBPATH_ENTRIES=[{ subpath: '.', file: 'src/public-api.ts' },{ subpath: './adapters', file: 'src/widget/adapters/index.ts' }];`,
		true,
		"C5",
	);
	runCase("N4 a derived entry file deleted from disk", "", true, "C1", { deleteEntry: "src/drawing-shim.ts" });
	runCase("P1 complete entry list", `const ENTRIES=[${quoted}];`, false, null);
	runCase("P2 component roots only (not an entry list)", `const ROOTS=["src/widget/VNInvestCharts.tsx","src/lib/core/DynamicChart"];`, false, null);
	runCase(
		"P3 a complete subpath map",
		`const SUBPATH_ENTRIES=[{ subpath: '.', file: 'src/public-api.ts' },{ subpath: './adapters', file: 'src/widget/adapters/index.ts' },{ subpath: './drawing', file: 'src/drawing-shim.ts' },{ subpath: './types', file: 'src/lib/types/runtime.ts' },{ subpath: './iframe-host', file: 'src/widget/iframe/host-entry.ts' }];`,
		false,
		null,
	);
	runCase(
		"P4 a list that names published entries PLUS extra roots (superset is legal)",
		`const ENTRIES=[${quoted},"src/demo/index.tsx","src/widget/VNInvestCharts.tsx"];`,
		false,
		null,
	);

	fs.rmSync(tmp, { recursive: true, force: true });

	console.log("check-build-entries SELF-TEST");
	for (const r of results) {
		console.log(`  ${r.verdict.padEnd(7)} ${r.name}`);
		console.log(`          expected=${r.expected} got=${r.got}`);
		console.log(`          ${r.detail}`);
	}
	const broken = results.filter((r) => r.verdict === "BROKEN");
	const negative = results.filter((r) => r.name.startsWith("N"));
	console.log(`  ${results.length} case(s), ${negative.length} negative, ${broken.length} broken`);
	if (broken.length) {
		console.error("SELF-TEST FAILED: at least one case did not bite.");
		process.exit(1);
	}
	console.log("SELF-TEST PASS");
}

/* ---------------------------------------------------------------------- main */

if (SELF_TEST) {
	selfTest();
} else {
	try {
		const { problems, entryCount, listsJudged, listsScanned, subpathCount } = check(ROOT);
		console.log(`check-build-entries: ${entryCount} published entries, ${subpathCount} subpaths`);
		// Both numbers are printed on purpose. "0 judged" alone is ambiguous: it could mean the
		// drift is gone, or that the scan is blind. `scanned` proves the scan still reads files.
		console.log(`  scanned ${listsScanned} entries/roots-named array(s); judged ${listsJudged} as entry lists`);
		console.log(`  (judged = 0 means every entry list now derives from build-entries.cjs, not that the scan is blind — see --self-test)`);
		if (problems.length) {
			console.error(`\nFAIL: ${problems.length} problem(s)`);
			for (const p of problems) console.error(`  ${p}`);
			process.exit(1);
		}
		console.log("PASS: every published entry exists, the root entry agrees across witnesses, no hand-written list is under-covered or stale.");
	} catch (err) {
		console.error(`FAIL: ${err.message}`);
		process.exit(1);
	}
}