#!/usr/bin/env node
/* Gate `audit:license` — one licence, declared in one place, checked mechanically.
 *
 * Why this exists instead of a checklist entry: the repo carried FOUR different
 * licence statements before this script (README badge MIT, README body MPL-2.0,
 * LICENSE and LICENSE.md both MIT text, package.json "MIT") while every bundled
 * engine package is Apache-2.0. Nobody noticed, because nothing compared them.
 *
 * §4(d) of Apache-2.0 requires NOTICE to name the bundled works. That makes the
 * dependency licence table a real obligation, not documentation polish - so it is
 * computed from the installed tree rather than typed by hand.
 *
 * Usage:
 *   node scripts/check-license.mjs             # check (exit 1 on any violation)
 *   node scripts/check-license.mjs --write     # rewrite the NOTICE dep table
 *   node scripts/check-license.mjs --self-test # negative proof (exit 0 = gate works)
 *
 * Exit 0 = consistent. Exit 1 = at least one violation. Exit 2 = bad usage.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* `--root` exists so the self-test can run this exact file against a TEMP COPY of
 * the repo. Asserting the end-to-end contract - "a MIT licence must exit non-zero" -
 * requires running the real reporting path over a real planted violation, and that
 * is only possible without mutating the checkout. */
const EXPECTED = "Apache-2.0";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const SELF_TEST = argv.includes("--self-test");
const rootIdx = argv.indexOf("--root");
const ROOT =
	rootIdx >= 0 && argv[rootIdx + 1]
		? path.resolve(argv[rootIdx + 1])
		: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const problems = [];
const notes = [];

// ---- helpers -------------------------------------------------------------------------------

const read = (p) => {
	try {
		return fs.readFileSync(p, "utf8");
	} catch {
		return null;
	}
};

const pkg = () => JSON.parse(read(path.join(ROOT, "package.json")));

const isNonEmptyFile = (p) => {
	try {
		return fs.statSync(p).size > 0;
	} catch {
		return false;
	}
};

/** Strip block + line comments so a licence name in prose cannot satisfy a check. */
const stripComments = (src) =>
	src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Direct dependencies actually shipped: dependencies + peerDependencies. */
function runtimeDeps(p) {
	return Object.keys({ ...(p.dependencies ?? {}), ...(p.peerDependencies ?? {}) }).sort();
}

/** SPDX expression each installed dependency actually declares. */
function depLicences(p) {
	const out = new Map();
	for (const name of runtimeDeps(p)) {
		const manifest = read(path.join(ROOT, "node_modules", ...name.split("/"), "package.json"));
		if (manifest === null) {
			notes.push(`dependency "${name}" is not installed; licence not verified`);
			out.set(name, "(not installed)");
			continue;
		}
		let licence = "(none declared)";
		try {
			const parsed = JSON.parse(manifest);
			licence = parsed.license ?? parsed.licenses?.map((l) => l.type).join(" OR ") ?? "(none declared)";
			if (typeof licence !== "string") licence = JSON.stringify(licence);
		} catch {
			problems.push(`cannot parse node_modules/${name}/package.json`);
		}
		out.set(name, licence);
	}
	return out;
}

// ---- checks -------------------------------------------------------------------------------

function checkSingleLicenseFile() {
	const entries = fs
		.readdirSync(ROOT)
		.filter((n) => /^LICEN[CS]E(\.md|\.txt)?$/i.test(n));

	if (entries.length === 0) {
		problems.push("no LICENSE file at the repo root");
		return null;
	}
	if (entries.length > 1) {
		// Two licence files is the original defect: they can drift, and readers cannot
		// tell which one governs.
		problems.push(`more than one LICENSE file at the repo root: ${entries.join(", ")}`);
	}
	const file = entries[0];
	const text = read(path.join(ROOT, file));
	if (!/Apache License/i.test(text)) {
		problems.push(`${file} does not contain the Apache License header`);
	}
	// The full text, not a one-line summary. §4 of Apache-2.0 distributes by
	// reference, so the reference has to resolve to the actual licence.
	const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").length;
	if (lines < 150) {
		problems.push(`${file} looks like a summary, not the full text (${lines} non-blank lines)`);
	}
	return file;
}

function checkNotice() {
	const p = path.join(ROOT, "NOTICE.md");
	if (!isNonEmptyFile(p)) {
		problems.push("NOTICE.md is missing or empty (Apache-2.0 §4(d) requires it)");
		return null;
	}
	const text = read(p);
	const required = [
		"@vninvestcharts/engine-core",
		"@vninvestcharts/engine-drawing",
		"@vninvestcharts/engine-react",
		"KLineCharts",
	];
	for (const needle of required) {
		if (!text.includes(needle)) problems.push(`NOTICE.md does not mention ${needle}`);
	}
	return text;
}

function checkPackageJson(licenseFile, noticeText) {
	const p = pkg();
	if (p.license !== EXPECTED) {
		problems.push(`package.json "license" is ${JSON.stringify(p.license)}, expected "${EXPECTED}"`);
	}
	const files = p.files ?? [];
	// npm excludes LICENSE/NOTICE automatically, but `files` is an allowlist and the
	// repo pins it, so the obligation is checked rather than assumed.
	//
	// The comparison is EXTENSION-EXACT, and that is the whole point. `files` holds
	// glob patterns, and a bare "NOTICE" does NOT match the file `NOTICE.md` - verified
	// with `npm pack --dry-run --json`: with "NOTICE" in the list the tarball contained
	// LICENSE but no NOTICE, and the published package silently dropped the §4(d)
	// notice. npm only auto-includes the licence files it recognises by exact name, and
	// an entry that looks close enough is worse than no entry, because it reads as
	// "handled".
	for (const needle of [licenseFile, "NOTICE.md"]) {
		if (!files.includes(needle)) {
			problems.push(
				`package.json "files" does not include the exact entry "${needle}" - it would not be published`,
			);
		}
	}
	// The NOTICE table is generated; if it was hand-edited into disagreement with the
	// tree, the file is worse than no file.
	if (noticeText) checkNoticeTableMatchesTree(noticeText);
}

function checkNoticeTableMatchesTree(noticeText) {
	const p = pkg();
	const table = noticeText.match(/```([\s\S]*?)```/)?.[1] ?? "";
	if (!table) {
		notes.push("NOTICE.md has no dependency table block; skipping table drift check");
		return;
	}
	const declared = new Map();
	for (const line of table.split(/\r?\n/)) {
		// Two columns, but the licence may itself contain spaces: `(MIT OR Apache-2.0)`,
		// `MIT AND Apache-2.0`. So take the name from the leading indent and treat the
		// REST of the line as the licence expression, rather than splitting on a token.
		const m = line.match(/^\s{2}(\S+)\s+(.+?)\s*$/);
		if (m) declared.set(m[1], m[2]);
	}
	for (const [name, licence] of depLicences(p)) {
		if (!declared.has(name)) {
			problems.push(`NOTICE.md dependency table is missing "${name}"`);
			continue;
		}
		if (declared.get(name) !== licence) {
			problems.push(
				`NOTICE.md says ${name} is ${declared.get(name)} but package.json declares ${licence}`,
			);
		}
	}
	for (const name of declared.keys()) {
		if (!runtimeDeps(p).includes(name)) {
			problems.push(`NOTICE.md lists "${name}", which is not a runtime dependency`);
		}
	}
}

function checkReadme(licenseFile) {
	const p = path.join(ROOT, "README.md");
	if (!isNonEmptyFile(p)) return;
	const text = stripComments(read(p));
	const badges = [...text.matchAll(/badge\/license-([A-Za-z0-9.+-]+)/g)].map((m) => m[1]);
	for (const b of badges) {
		// shields.io slugifies the dash in Apache-2.0
		const normalised = b.replace(/-/g, "-");
		if (!/apache|MIT|MPL|BSD|GPL|LGPL|ISC/i.test(normalised)) {
			problems.push(`README licence badge says "${b}", which is not a known licence`);
		}
		if (/mit/i.test(b) || /mpl/i.test(b) || /gpl/i.test(b)) {
			problems.push(
				`README licence badge says "${b}" but the project licence is ${EXPECTED}`,
			);
		}
	}
	const bodyMentions = [...text.matchAll(/\*\*(Apache-2\.0|MIT|MPL-2\.0|AGPL-3\.0|GPL)/gi)].map(
		(m) => m[1],
	);
	for (const m of bodyMentions) {
		if (!/apache/i.test(m)) problems.push(`README states the project is licensed ${m}`);
	}
	// A link to a LICENSE file that no longer exists is a dead reference; S2 removed
	// LICENSE.md, and README still pointed at it.
	if (licenseFile) {
		for (const m of text.matchAll(/\]\(\.?\/?(LICENSE[^)]*)\)/g)) {
			if (m[1] !== licenseFile) {
				problems.push(`README links to ${m[1]}, but the only LICENSE file is ${licenseFile}`);
			}
		}
	}
}

function renderNoticeTable() {
	const p = pkg();
	const rows = [...depLicences(p)];
	const width = Math.max(...rows.map(([n]) => n.length));
	return rows.map(([n, l]) => `  ${n.padEnd(width)}  ${l}`).join("\n");
}

// ---- self-test -----------------------------------------------------------------------------

/**
 * The self-test must be able to FAIL, including when this script itself is broken.
 *
 * The first version of this file printed "9/9 PASS" after `problems.length = 0` was
 * inserted directly above the reporting branch - it neutered every detection and
 * still passed, because each case asserted on the CURRENT clean repo rather than on
 * a planted violation. A self-test that only ever sees good input cannot tell a gate
 * from a no-op, and "self-test 9/9" then reads as proof of a gate that does nothing.
 *
 * So each case below does three things:
 *   1. plants a REAL violation (or neuters the real check),
 *   2. runs the real check function against it,
 *   3. asserts the check produced a finding.
 *
 * `runChecks()` is the gate body, factored out so the self-test and the main path
 * execute the SAME code. A self-test that reimplements the logic tests itself.
 */
function runChecks() {
	problems.length = 0;
	notes.length = 0;
	const licenseFile = checkSingleLicenseFile();
	const noticeText = checkNotice();
	checkPackageJson(licenseFile, noticeText);
	checkReadme(licenseFile);
	return problems.slice();
}

function selfTest() {
	let failed = 0;
	const check = (name, fn) => {
		try {
			fn();
			console.log(`PASS  ${name}`);
		} catch (error) {
			console.log(`FAIL  ${name}: ${error.message}`);
			failed += 1;
		}
	};

	check("CLEAN REPO PRODUCES NO FINDINGS", () => {
		const found = runChecks();
		if (found.length) throw new Error(`clean repo reported ${found.length}: ${found[0]}`);
	});

	check("a MIT README licence badge is detected", () => {
		const saved = fs.readFileSync;
		try {
			fs.readFileSync = (p, ...rest) => {
				const target = String(p);
				if (target.endsWith("README.md")) {
					return "# x\n\n[![license](https://img.shields.io/badge/license-MIT-green.svg)]()\n";
				}
				return saved(p, ...rest);
			};
			const found = runChecks();
			if (!found.some((f) => /badge/i.test(f))) {
				throw new Error("runChecks found nothing when the README badge said MIT");
			}
		} finally {
			fs.readFileSync = saved;
		}
	});

	check("two LICENSE files are detected", () => {
		const saved = fs.readdirSync;
		try {
			fs.readdirSync = (p, ...rest) => {
				const target = String(p);
				const real = saved(p, ...rest);
				if (target === ROOT) return [...real, "LICENSE.md"];
				return real;
			};
			const found = runChecks();
			if (!found.some((f) => /more than one LICENSE/i.test(f))) {
				throw new Error("runChecks found nothing with a second LICENSE file");
			}
		} finally {
			fs.readdirSync = saved;
		}
	});

	check("NEUTERING THE GATE IS DETECTED", () => {
		// The case that matters most, and the one the first self-test could not see.
		//
		// Mutating the REPORTING line (`findings.length = 0` inserted just above it)
		// makes the main run print PASS and exit 0 while checking nothing - yet
		// `runChecks()` still returns the findings, because it never touches that line.
		// So a self-test that only calls runChecks() reports 5/5 PASS on a gate that
		// checks nothing.
		//
		// This case therefore asserts the END TO END contract: given a planted
		// violation, the process must exit non-zero. It re-executes this same file with
		// an injected MIT licence in a temp copy of the repo, so the reporting path,
		// the checks and the exit code are all exercised together.
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vnsc-lic-selftest-"));
		try {
			for (const f of ["package.json", "LICENSE", "NOTICE.md", "README.md"]) {
				const src = read(path.join(ROOT, f));
				if (src !== null) fs.writeFileSync(path.join(dir, f), src, "utf8");
			}
			// Plant the violation the main path must refuse.
			const broken = JSON.parse(read(path.join(ROOT, "package.json")));
			broken.license = "MIT";
			fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(broken, null, "\t"), "utf8");
			// NOTICE.md's generated table is derived from package.json; a changed licence
			// is what checkPackageJson reports, and the table check must not mask it.
			let r;
			try {
				execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--root", dir], {
					stdio: "pipe",
				});
				r = 0;
			} catch (e) {
				r = e.status ?? 1;
			}
			if (r === 0) throw new Error("gate exited 0 on a repo whose package.json says MIT");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	check("the banned-check path reaches a real check", () => {
		// Proves runChecks() is wired to the individual checks rather than returning an
		// empty array: corrupt the repo state in memory and require a finding.
		const savedRead = fs.readFileSync;
		const originalLicense = pkg.license;
		try {
			fs.readFileSync = (p, ...rest) =>
				String(p).endsWith("package.json") && String(p).includes("package")
					? JSON.stringify({ ...pkg, license: "MIT" })
					: savedRead(p, ...rest);
			const found = runChecks();
			if (!found.some((f) => /license/i.test(f))) {
				throw new Error("runChecks found nothing when license was MIT");
			}
		} finally {
			fs.readFileSync = savedRead;
			void originalLicense;
		}
	});

	console.log(failed === 0 ? "\nself-test: 5/5 PASS" : `\nself-test: ${failed} FAILED`);
	process.exit(failed === 0 ? 0 : 1);
}

// ---- main ----------------------------------------------------------------------------------

if (SELF_TEST) {
	if (argv.some((a) => a !== "--self-test")) {
		console.error("--self-test takes no other flags");
		process.exit(2);
	}
	selfTest();
}

// In --write mode the file on disk is stale by definition, so validating it first
// reports every dependency as "missing" and then exits 1 on the file the same run
// just corrected. Write, then re-read, then check - all through the same helpers
// the self-test drives.
if (WRITE) {
	const p = path.join(ROOT, "NOTICE.md");
	const current = read(p) ?? "";
	const block = /```[\s\S]*?```/;
	const table = renderNoticeTable();
	const next = block.test(current)
		? current.replace(block, "```\n" + table + "\n```")
		: `${current}\n\n\`\`\`\n${table}\n\`\`\`\n`;
	fs.writeFileSync(p, next, "utf8");
	console.log("NOTICE.md dependency table rewritten from the installed tree");
}

const findings = runChecks();

if (findings.length > 0) {
	console.error(`FAIL: ${findings.length} licence inconsistency/ies\n`);
	for (const p of findings) console.error(`  - ${p}`);
	if (notes.length) {
		console.error(`\nnotes (${notes.length}):`);
		for (const n of notes) console.error(`  · ${n}`);
	}
	process.exit(1);
}

console.log(`PASS: licence is consistently ${EXPECTED} across package.json, LICENSE, NOTICE.md, README`);
for (const n of notes) console.log(`  · ${n}`);