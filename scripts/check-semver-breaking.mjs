#!/usr/bin/env node
/**
 * check-semver-breaking.mjs — W-11: a public API removal must cost a major bump.
 *
 * The problem this exists for: this package is published (`@vninvestcharts/widget`).
 * Everything `src/public-api.ts` exports is a promise to every consumer on npm.
 * Nothing enforced that promise — `check:version` only keeps five hardcoded version
 * strings in sync, and `generate-release-manifest.js` records which commit is running.
 * Both can be perfectly green while an export is silently deleted, so a 0.3.0
 * consumer breaks on a patch release.
 *
 * ## What counts as breaking
 *
 * Removed or renamed export names, and removed `package.json` export subpaths. Both
 * are things a consumer references by name; removing either breaks their build.
 *
 * ## What does NOT count, and why that matters
 *
 * Additions are not breaking — that is the whole point of a minor bump. Signature
 * *widenings* are also not detected, and this script says so out loud rather than
 * implying full type-level semver coverage: it reads names, not types. A changed
 * parameter type or a newly-required prop in an existing interface will pass. That
 * gap is real and is why this gate is described as "catches renames and removals",
 * not "enforces semver". Clawing that back needs a `.d.ts` differ, which needs a
 * build — expensive, and CI is currently off on this repo anyway.
 *
 * ## Base selection
 *
 * `origin/dev` merge-base by default: the divergence point, so a feature branch that
 * legitimately removed an export before dev saw it is judged against dev, not against
 * the branch's first commit. Overridable, because a shallow clone has no merge-base
 * and the script should be runnable locally:
 *
 *   node scripts/check-semver-breaking.mjs
 *   node scripts/check-semver-breaking.mjs --base <ref>
 *   SEMVER_BASE=<ref> node scripts/check-semver-breaking.mjs
 *
 * ## Exit codes
 *
 * 0  no breaking change, or breaking change with a major bump
 * 1  breaking change without a major bump
 * 2  could not run (no git history, missing base, unreadable file)
 *
 * Exit 2 is separate on purpose. "Cannot verify" must never look like "verified".
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const { publishedEntries } = require_('./build-entries.cjs');

/** The `exports` subpaths of the package, each paired with the source file that builds it. */
function publishedSubpathEntries() {
	return publishedEntries()
		.filter((e) => e.subpath.startsWith('.'))
		.map((e) => ({ subpath: e.subpath, file: e.source }));
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
	console.error(`FAIL: ${message}`);
	process.exit(2);
}

function git(args, { allowFail = false } = {}) {
	try {
		return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	} catch (err) {
		if (allowFail) return null;
		fail(`git ${args.join(' ')} failed: ${err.message.split('\n')[0]}`);
	}
}

/**
 * Collect the export names declared by one version of the entry file.
 *
 * `export { a, b as c } from './x'` publishes `c`, not `b`, so aliases are resolved
 * to the published name — that is the whole point, since a consumer imports the alias.
 * `export type {...}` publishes the same way as a value export.
 */
function collectExportNames(source) {
	const names = new Set();

	// Braced lists, including multi-line ones, with an optional `type` modifier.
	const braced = /export\s+(?:type\s+)?\{([\s\S]*?)\}\s*from/g;
	for (const match of source.matchAll(braced)) {
		for (const raw of match[1].split(',')) {
			const entry = raw.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//, '').trim();
			if (!entry) continue;
			const parts = entry.split(/\s+as\s+/);
			names.add((parts[1] ?? parts[0]).trim());
		}
	}

	// Declarations: `export const version`, `export interface Props`, `export function x`,
	// `export class X`, `export type Alias`, `export enum E`.
	const declared =
		/^export\s+(?:declare\s+)?(?:const|let|var|function|class|interface|type|enum|abstract\s+class)\s+([A-Za-z_$][\w$]*)/gm;
	for (const match of source.matchAll(declared)) {
		names.add(match[1]);
	}

	// `export * from '...'` publishes an unknown set of names. Silently ignoring it
	// would make this gate look like it covers the file while covering none of it -
	// which is exactly what happened with src/drawing-shim.ts: two real exports were
	// deleted from it and this script reported "no removed or renamed public export",
	// exit 0. Resolving the star would need the imported module's own export list;
	// reporting it as opaque is the honest minimum.
	const starReexports = [...source.matchAll(/^export\s+\*(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*from/gm)];

	return { names, starReexports };
}

/** Export subpath keys declared in package.json, with leading dots normalized off. */
function collectSubpaths(pkgSource) {
	let pkg;
	try {
		pkg = JSON.parse(pkgSource);
	} catch (err) {
		fail(`package.json is not valid JSON: ${err.message}`);
	}
	const exportsField = pkg.exports;
	if (!exportsField || typeof exportsField !== 'object') return null;
	return new Set(
		Object.keys(exportsField)
			.map((key) => (key === '.' ? '.' : key.replace(/^\.\//, '')))
			.sort(),
	);
}

function parseVersion(v) {
	const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v ?? '');
	return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), raw: v } : null;
}

const argv = process.argv.slice(2);
const baseFlagIdx = argv.indexOf('--base');
const baseRef = baseFlagIdx !== -1 ? argv[baseFlagIdx + 1] : process.env.SEMVER_BASE ?? 'origin/dev';

if (baseFlagIdx !== -1 && !baseRef) fail('--base was given without a ref');

const mergeBase = git(['merge-base', 'HEAD', baseRef], { allowFail: true });
if (!mergeBase) {
	fail(
		`no merge-base between HEAD and "${baseRef}". This repo has CI off and may be a ` +
			`shallow clone, so dev may not be fetched. Pass --base <ref> to compare against ` +
			`something you know exists locally.`,
	);
}

function readAt(ref, file) {
	const out = git(['show', `${ref}:${file}`], { allowFail: true });
	if (out === null) return null;
	return out;
}

/**
 * Every source file that backs a public subpath.
 *
 * The root entry alone left four subpaths uncovered: a consumer importing
 * `@vninvestcharts/widget/drawing` resolves to src/drawing-shim.ts, and deleting an
 * export from it was invisible here.
 *
 * The list is now genuinely derived — from the build config, via scripts/build-entries.cjs — so
 * adding an entry point cannot leave this gate reading a stale copy. Until 2026-10-16 the list
 * below this comment was hand-written while this comment claimed it was not; the claim was the
 * bug. Subpaths only: the IIFE and iframe bundles ship as files, not as `exports` keys.
 */
const SUBPATH_ENTRIES = publishedSubpathEntries();

function readSourceAt(ref, file) {
	// On HEAD, read from disk: the working tree may hold uncommitted work.
	if (ref === 'HEAD' && existsSync(path.join(ROOT, file))) {
		try {
			return readFileSync(path.join(ROOT, file), 'utf8');
		} catch {
			// A directory, a dangling symlink, a permission problem: all unreadable,
			// none of them "a source file with no content". Returning null routes them to
			// the same fail() as a missing path, which is the documented exit 2.
			//
			// Without this the caller got an uncaught EISDIR and the process died with
			// exit 1 and a stack trace - a verdict-looking exit code carrying no verdict,
			// which is the one thing the exit-2 contract exists to prevent.
			return null;
		}
	}
	return readAt(ref, file);
}

const headPkgRaw = readFileSync(path.join(ROOT, 'package.json'), 'utf8');
const basePkgRaw = readAt(mergeBase, 'package.json');
if (basePkgRaw === null) {
	fail(`cannot read package.json at base ${mergeBase.slice(0, 12)}`);
}

const headSubpaths = collectSubpaths(headPkgRaw);
const baseSubpaths = collectSubpaths(basePkgRaw);

// Names are namespaced by subpath. Collapsing them into one set would report
// `Foo` as "removed" when only the ./drawing copy of Foo disappeared.
const headByEntry = new Map();
const baseByEntry = new Map();
const opaqueEntries = [];

for (const { subpath, file } of SUBPATH_ENTRIES) {
	if (headSubpaths && !headSubpaths.has(subpath === '.' ? '.' : subpath.replace(/^\.\//, ''))) {
		continue;
	}
	const headSource = readSourceAt('HEAD', file);
	const baseSource = readAt(mergeBase, file);
	// A listed source file that cannot be read means the path in SUBPATH_ENTRIES is
	// wrong, and this subpath is then silently not checked at all.
	//
	// That is not a hypothetical: while writing this script I guessed
	// src/widget/iframe/iframeHostEntry.ts instead of host-entry.ts, and this line
	// swallowed the mistake - the gate reported full coverage while reading four of
	// five files. The second audit reproduced it deliberately by pointing ./types at
	// a typo'd path: exit 0, no warning.
	//
	// So an unreadable entry is a hard failure, not a skip. Exit 2, distinguishable
	// from a verdict.
	if (headSource === null) {
		fail(`SUBPATH_ENTRIES points ${subpath} at ${file}, which does not exist. Fix the path.`);
	}
	if (baseSource === null) {
		// Two very different situations collapse into `null` here, and reading it as
		// "new entry point, nothing to compare" is the fail-open branch this whole
		// commit exists to remove.
		//
		// `readAt` returns null both when the path is genuinely absent at the base and
		// when git itself failed - a moved file, a rename, a lock file, a shallow clone.
		// Treating a git failure as "no baseline" means the entry is compared against
		// an empty set: every name it exports reads as added, every removal goes
		// unnoticed, and the gate prints OK. Verified by pointing ./types at a file
		// that exists at HEAD but not at the base: `exports 145 -> 174` against a
		// 165 -> 183 baseline, no warning, exit 0.
		//
		// So ask git whether the path exists at that revision, separately from whether
		// it can be read. Only the genuine "absent at base" case is a new entry point,
		// and even then it is reported rather than passed over.
		const existedAtBase = git(['cat-file', '-e', `${mergeBase}:${file}`], { allowFail: true }) !== null;
		const { names } = collectExportNames(headSource);
		if (existedAtBase) {
			fail(
				`cannot read ${file} at base ${mergeBase.slice(0, 12)} although git says it exists there. ` +
					`Refusing to compare against an empty baseline.`,
			);
		}
		opaqueEntries.push(
			`${subpath} (${file}): not present at base ${mergeBase.slice(0, 12)} - ` +
				`treated as a new entry point, removals there are NOT compared`,
		);
		headByEntry.set(subpath, names);
		baseByEntry.set(subpath, new Set());
		continue;
	}
	const head = collectExportNames(headSource);
	const base = collectExportNames(baseSource);
	headByEntry.set(subpath, head.names);
	baseByEntry.set(subpath, base.names);
	for (const match of head.starReexports) {
		opaqueEntries.push(`${subpath} (${file}): export *${match[1] ? ` as ${match[1]}` : ''} from ...`);
	}
}

// A subpath in the manifest with no source file listed here is a coverage hole,
// and saying nothing about it is how this script came to look trustworthy.
if (headSubpaths) {
	const known = new Set(SUBPATH_ENTRIES.map((e) => (e.subpath === '.' ? '.' : e.subpath.replace(/^\.\//, ''))));
	const uncovered = [...headSubpaths].filter((key) => !known.has(key));
	for (const key of uncovered) {
		opaqueEntries.push(`${key}: declared in exports map with no source file listed in SUBPATH_ENTRIES`);
	}
}

const removedNames = [];
const addedNames = [];
for (const [subpath, baseSet] of baseByEntry) {
	const headSet = headByEntry.get(subpath) ?? new Set();
	for (const name of baseSet) if (!headSet.has(name)) removedNames.push(`${name}  [${subpath}]`);
	for (const name of headSet) if (!baseSet.has(name)) addedNames.push(`${name}  [${subpath}]`);
}
removedNames.sort();
addedNames.sort();

const headNames = new Set([...headByEntry.values()].flatMap((s) => [...s]));
const baseNames = new Set([...baseByEntry.values()].flatMap((s) => [...s]));

const removedSubpaths = [];
if (baseSubpaths && headSubpaths) {
	for (const key of baseSubpaths) if (!headSubpaths.has(key)) removedSubpaths.push(key);
}

const headVersion = parseVersion(JSON.parse(headPkgRaw).version);
const baseVersion = parseVersion(JSON.parse(basePkgRaw).version);
if (!headVersion) fail(`package.json version "${JSON.parse(headPkgRaw).version}" is not semver`);
if (!baseVersion) fail(`base version "${JSON.parse(basePkgRaw).version}" is not semver`);

const breaking = [
	...removedNames.map((n) => `removed export: ${n}`),
	...removedSubpaths.map((s) => `removed exports subpath: ${s}`),
];

const majorBumped = headVersion.major > baseVersion.major;

console.log(`base      ${mergeBase.slice(0, 12)} (merge-base with ${baseRef})`);
console.log(`version   ${baseVersion.raw} -> ${headVersion.raw}`);
console.log(`exports   ${baseNames.size} -> ${headNames.size}`);
if (baseSubpaths && headSubpaths) {
	console.log(`subpaths  ${baseSubpaths.size} -> ${headSubpaths.size}`);
}
if (addedNames.length) console.log(`added     ${addedNames.length}: ${addedNames.join(', ')}`);

// Coverage holes are printed on every run, including on a pass. A warning that only
// shows when the gate fails is a warning nobody reads, and the whole point here is
// that this gate previously reported full coverage of a file it never parsed.
if (opaqueEntries.length) {
	console.log(`\nNOT CHECKED (${opaqueEntries.length}) - coverage gaps, not failures:`);
	for (const item of opaqueEntries) console.log(`  ! ${item}`);
	console.log('  These names are not compared. A removal there would NOT be reported.');
}

if (breaking.length === 0) {
	console.log('\nOK: no removed or renamed public export.');
	process.exit(0);
}

console.log(`\nBREAKING (${breaking.length}):`);
for (const item of breaking) console.log(`  - ${item}`);

if (majorBumped) {
	console.log(`\nOK: breaking change acknowledged by a major bump (${baseVersion.major} -> ${headVersion.major}).`);
	process.exit(0);
}

console.log(
	`\nFAIL: breaking public API change with no major bump ` +
		`(${baseVersion.major}.${baseVersion.minor}.${baseVersion.patch} -> ${headVersion.major}.${headVersion.minor}.${headVersion.patch}).`,
);
console.log('Consumers pin a caret range; shipping this as a minor or patch breaks their build.');
console.log('Either bump major, or restore the export. See PLAN_BACKLOG_SPLIT W-11.');
process.exit(1);