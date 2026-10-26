#!/usr/bin/env node
/**
 * gen-engine-tsconfig-paths.mjs — make `tsc` resolve the engine twin repo.
 *
 * WHY THIS EXISTS
 * tsup, webpack and vitest all read VN_ENGINE_REPO (see their configs), but
 * `tsc` cannot: tsconfig.json is plain JSON with no env interpolation. The old
 * setup hardcoded `..\\vninvestcharts-engine\\...`, which meant `npm run
 * type-check` silently resolved the three engine packages through
 * `node_modules` instead. In a worktree that node_modules points at the
 * *unmodified* sibling engine, so type-check ran against the published 1.1.0
 * drawing fork and reported 171 errors that have nothing to do with the code
 * under test — while the test suite, which does honour the env var, was green.
 * That asymmetry hid a real gate.
 *
 * So: emit the paths map from the same env var every other tool uses, and fail
 * closed if the resolved repo is not there. A typo'd VN_ENGINE_REPO is now an
 * error instead of a silently wrong type-check.
 *
 * The engine is consumed from the REGISTRY (`package.json` declares
 * `@vninvestcharts/engine-core@^1.3.0`, `-drawing@^2.0.2`, `-react@^2.0.2`;
 * `npm ci` resolves them). This script only decides whether `tsc` should be
 * pointed at a WORKING COPY of the engine instead — which is a local-dev
 * convenience for the twin repo, never the default.
 *
 * The output is GENERATED and is deliberately NOT tracked in git (it is in
 * `.gitignore`). That reverses an earlier decision whose justification was
 * inverted: the old header argued that committing it let "editors and any tool
 * that reads tsconfig.json without running npm scripts still work" — but a
 * committed sibling-repo path is precisely what breaks those readers on every
 * machine that is not the one that authored it. A fresh clone with no engine
 * checkout was handed a `paths` map pointing at a directory that does not exist.
 * Untracked, a clone simply has no file until `npm run type-check` / `npm test` /
 * `npm run build` creates the correct one for that machine.
 *
 * Usage: node scripts/gen-engine-tsconfig-paths.mjs [--check]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tsconfig.engine-paths.json');

/** Same precedence as tsup/webpack/vitest: env var wins, else the sibling repo. */
const engineRepo = resolve(process.env.VN_ENGINE_REPO || join(ROOT, '..', 'vninvestcharts-engine'));

// Modern package names ONLY. These are the three specifiers `src/` actually imports.
//
// The five misspelled `@vninstallcharts/*` aliases (doubled "l") used to be listed here
// too, on the theory that "docs and stray configs still reference them". Measured on
// 2026-10-03: **0 imports** across src/, tests/, config/, scripts/ and embed-demo/;
// the only remaining hits were 23 prose mentions in docs/upgrade-standard/ (historical
// ledger text) and the 5 entries this file used to emit. Keeping them cost a wrong
// entry in a committed tsconfig and the standing chance of swallowing a future typo,
// for no consumer. Removed — see ledger F02_REGISTRY_ENGINE_RESOLUTION_2026-10-03.
const MODERN_ENTRIES = [
	['@vninvestcharts/engine-core', 'vn-kline-engine-core'],
	['@vninvestcharts/engine-drawing', 'vn-kline-engine-drawing'],
	['@vninvestcharts/engine-react', 'vn-kline-engine-react'],
	['@vninvestcharts/engine-pro', 'vn-kline-engine-pro'],
];

const ENGINE_ENTRIES = [...MODERN_ENTRIES];

/**
 * Where should `tsc` read the engine's types from?
 *
 * Two legitimate situations, and picking only one of them breaks the other:
 *
 *  - Local twin-repo development. The developer is editing the engine next door
 *    and needs the widget to see those edits, which means resolving to the
 *    checkout rather than to whatever npm last published. VN_ENGINE_REPO (or
 *    the sibling repo) supplies it.
 *  - CI and consumers. Only the published packages exist. There is no engine
 *    checkout at all, and the only correct answer is node_modules.
 *
 * So: use the repo when there is a usable one, and fall back to node_modules
 * otherwise. A repo that is present but unusable is a hard error - that is the
 * case that produced 171 wrong errors, and it must never be silent.
 */
const MARKERS = [
	join('packages', 'vn-kline-engine-drawing', 'src', 'drawingContextMenuTypes.ts'),
	join('packages', 'vn-kline-engine-react', 'src', 'drawing-ui', 'index.ts'),
	join('packages', 'vn-kline-engine-pro', 'src', 'index.ts'),
];

function inspectRepo(repo) {
	const built = ENGINE_ENTRIES.map(([, pkg]) => join(repo, 'packages', pkg, 'dist', 'index.d.ts'));
	const notBuilt = built.filter((p) => !existsSync(p));
	const notMigrated = MARKERS.filter((m) => !existsSync(join(repo, m)));
	const hasPackages = existsSync(join(repo, 'packages'));
	return { repo, hasPackages, notBuilt, notMigrated, usable: hasPackages && !notBuilt.length && !notMigrated.length };
}

const candidate = inspectRepo(engineRepo);
const explicit = Boolean(process.env.VN_ENGINE_REPO);

if (explicit && !candidate.usable) {
	// The user named an engine; if it is the wrong one, say so instead of quietly
	// falling back to the published packages.
	const why = !candidate.hasPackages
		? 'there is no packages/ directory there'
		: candidate.notMigrated.length
			? 'it predates the drawing SSOT migration'
			: 'the engine is not built';
	console.error(
		`FAIL gen-engine-tsconfig-paths: VN_ENGINE_REPO=${engineRepo} is not usable (${why}).\n` +
			candidate.notBuilt.map((m) => `  not built: ${m}`).join('\n') +
			candidate.notMigrated.map((m) => `  missing:   ${m}`).join('\n') +
			'\n  Build it first (AGENTS.md Rule 13), point VN_ENGINE_REPO elsewhere, or unset it to\n' +
			'  resolve the engine from node_modules instead.',
	);
	process.exit(1);
}

const useRepo = candidate.usable;

// Point at the engine's BUILT declarations, not its source.
//  - This is the contract AGENTS.md Rule 13 already states: the widget consumes
//    the engine's dist, and that is what a consumer of this package resolves.
//  - Pulling engine *source* into the program breaks the declaration emit twice
//    over: tsconfig.dts.json sets rootDir: src (TS6059), and tsup's dts step
//    then hits TS2883 on inferred types that need a ReactPortal identity from
//    the engine's own node_modules — a path no consumer can resolve.
//
// When there is no usable engine checkout, the engine specifiers are simply left
// out of `paths` and TypeScript resolves them from node_modules, which is the
// published package. That is the only correct answer for CI and for consumers.
const paths = { '@lib/*': ['src/lib/*'] };
// open-core split Phase 2b: widget-pro is a local sub-package (not engine).
// Only added when vn-kline-widget-pro checkout exists (monorepo private).
// In open-core snapshot, consumers resolve it via their own install (or fail-closed at adapter boundary).
if (existsSync(join(ROOT, 'packages', 'vn-kline-widget-pro', 'src', 'index.ts'))) {
	paths['@vninvestcharts/widget-pro'] = ['packages/vn-kline-widget-pro/src/index.ts'];
}
// Never put the absolute engine path in the file. This file is committed, and an absolute
// C:\Users\<you>\... or a temp worktree path leaks into git and then every fresh clone
// disagrees with whoever committed last. VN_ENGINE_REPO still decides WHICH repo is used;
// only the human-readable note is generalised.
const source = useRepo
	? 'repo checkout (built declarations, per AGENTS.md Rule 13) — see VN_ENGINE_REPO'
	: 'node_modules (published packages — no engine checkout found)';
if (useRepo) {
	// tsconfig `paths` resolve against `baseUrl` (the repo root), so emit a real
	// relative path — a worktree may live anywhere, not just as a sibling folder.
	const relRepo = relative(ROOT, engineRepo).split(/[\\/]/).join('/');
	for (const [specifier, pkg] of ENGINE_ENTRIES) {
		// Forward slashes: tsconfig paths are consumed by non-Windows toolchains too.
		paths[specifier] = [`${relRepo}/packages/${pkg}/dist/index.d.ts`];
	}
}

const header =
	'// GENERATED by scripts/gen-engine-tsconfig-paths.mjs — do not edit by hand.\n' +
	'// Regenerated by the pretype-check / pretest npm scripts.\n' +
	`// Engine source: ${source}\n` +
	'// Set VN_ENGINE_REPO to a built engine checkout to type-check against it instead.\n';

const contents = header + JSON.stringify({ compilerOptions: { baseUrl: '.', paths } }, null, 2) + '\n';

if (process.argv.includes('--check')) {
	if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== contents) {
		console.error('FAIL gen-engine-tsconfig-paths: tsconfig.engine-paths.json is stale — run: npm run gen:engine-paths');
		process.exit(1);
	}
	console.log(`OK gen-engine-tsconfig-paths: up to date (${source})`);
} else {
	writeFileSync(OUT, contents, 'utf8');
	console.log(`wrote tsconfig.engine-paths.json (${source})`);
}
