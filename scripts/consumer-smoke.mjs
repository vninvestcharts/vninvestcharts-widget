#!/usr/bin/env node
/**
 * consumer-smoke.mjs — REL-01: compile a real consumer against the packed tarball.
 *
 * Đây là bằng chứng bắt buộc của AC-REL-01-1/2: declaration phải resolve được
 * đúng cây thư mục sau khi pack, không chỉ pass type-check trong source tree.
 *
 * Cách làm: npm pack → giải nén → tạo fixture TypeScript trong repo (để resolve
 * được react/@types từ node_modules của repo) → trỏ `paths` vào cây dts trong tarball
 * → chạy tsc --noEmit với strict.
 *
 * Usage: node scripts/consumer-smoke.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Temp dir must live INSIDE the repo so Node/TS module resolution walks up into
// the repo's own node_modules (react types + file:linked engine packages).
const WORK = mkdtempSync(join(ROOT, '.consumer-smoke-'));
const IS_WIN = process.platform === 'win32';
const NPM = IS_WIN ? 'npm.cmd' : 'npm';
const NPX = IS_WIN ? 'npx.cmd' : 'npx';

function run(cmd, args, opts = {}) {
	// Node >=18.20 on Windows refuses to spawn .cmd/.bat without shell.
	const needsShell = IS_WIN && /\.(cmd|bat)$/i.test(cmd);
	return execFileSync(cmd, args, {
		cwd: ROOT,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		shell: needsShell,
		...opts
	});
}

function fail(msg) {
	console.error(`\nFAIL consumer-smoke: ${msg}`);
	process.exitCode = 1;
}

try {
	const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
	console.log(`packing ${pkg.name}@${pkg.version} ...`);
	// Use a RELATIVE destination: `shell: true` (required for npm.cmd on Windows)
	// does not escape args, and the repo path contains spaces.
	const workRel = WORK.slice(ROOT.length + 1);
	const packOut = run(NPM, ['pack', '--pack-destination', workRel, '--silent']);
	const tarball = packOut.trim().split('\n').pop().trim();
	const tarPath = join(WORK, tarball);
	if (!existsSync(tarPath)) throw new Error(`tarball not produced: ${tarPath}`);

	const pkgDir = join(WORK, 'pkg');
	mkdirSync(pkgDir, { recursive: true });
	run('tar', ['-xzf', tarPath, '-C', pkgDir, '--strip-components=1']);

	// --- AC-REL-01-2: declaration root phải tồn tại và import nội bộ resolve được
	const declaredTypes = pkg.exports['.'].types.replace(/^\.\//, '');
	const typesFile = join(pkgDir, declaredTypes);
	if (!existsSync(typesFile)) {
		throw new Error(`package types path missing in tarball: ${declaredTypes}`);
	}
	console.log(`  OK types entry present: ${declaredTypes}`);

	// Derive the subpath list from the manifest instead of hardcoding it.
	//
	// A hardcoded array cannot notice a subpath being ADDED. Measured: injecting
	// "./__probe" -> dist/__nope.d.ts into pkg.exports left this script reporting
	// PASS, because nothing ever looked at the new key. That makes the list below a
	// snapshot of what someone remembered, not what the package ships.
	//
	// Note the shape difference too: subpaths with no "types" (./iframe, and the CSS
	// entry) are real subpaths a consumer can import, they just carry no type
	// declaration. They are still checked for their default target; only the types
	// assertion is skipped, and the skip is visible in the output rather than silent.
	const entryPoints = Object.keys(pkg.exports ?? {});
	if (entryPoints.length === 0) throw new Error('package.json exports map is empty or missing');
	for (const ep of entryPoints) {
		const spec = pkg.exports[ep];
		// Two shapes appear in this manifest and both are legal: a bare string
		// ("./iframe" -> "./dist/iframe/....js", and the CSS entry) and a condition map.
		// Treating the string case as an object produced a script that demanded a shape
		// the package does not use - an unsatisfiable criterion that fails on a healthy
		// tree. So normalise first, then collect every target worth asserting.
		const entries =
			typeof spec === 'string'
				? { default: spec }
				: (spec ?? {});
		const targets = [];
		// `require` is a real resolution target and all five object subpaths declare
		// one. Checking only types/import/default left a require pointing at a
		// nonexistent file green, which breaks CJS consumers silently - they resolve
		// at require time, not install time.
		for (const key of ['types', 'import', 'default', 'require', 'node', 'browser']) {
			const value = entries[key];
			if (typeof value === 'string' && value.length > 0) {
				targets.push({ key, rel: value.replace(/^\.\//, '') });
			}
		}
		if (targets.length === 0) {
			// A subpath this script cannot interpret is a fact to surface, not to skip.
			// Silently continuing is what let a nonexistent target pass before.
			throw new Error(
				`subpath ${ep} declares no types/import/default target this script can check ` +
					`(spec: ${JSON.stringify(spec)})`,
			);
		}
		for (const { key, rel } of targets) {
			if (!existsSync(join(pkgDir, rel))) {
				throw new Error(`subpath ${ep} (${key}) -> ${rel} missing in tarball`);
			}
		}
		console.log(`  OK subpath ${ep} -> ${targets.map((t) => t.rel).join(', ')}`);
	}

	if (readdirSync(join(pkgDir, 'dist')).some((f) => f.endsWith('.map'))) {
		throw new Error('.map files present in tarball (AC-REL-01: must be excluded)');
	}
	console.log('  OK no .map files in tarball');

	// --- AC-REL-01-1: consumer strict compile dùng đúng cây dts của tarball
	const srcDir = join(WORK, 'src');
	mkdirSync(srcDir, { recursive: true });
	writeFileSync(join(srcDir, 'consumer.ts'), [
		`import { VNInvestCharts, VNInvestMultiCharts, version } from '${pkg.name}';`,
		`import type { VNInvestChartsProps, VNInvestMultiChartsProps } from '${pkg.name}';`,
		// SAD F-06 lock: WIDGET_INTEGRATION_GUIDE.md:35 documents this import;
		// before 2026-10-18 no barrel re-exported registerProExtension, so an
		// ESM host following the guide got a compile error / undefined while
		// this gate stayed green (it was a witness at the old scope only).
		`import { registerProExtension, isProExtensionActive } from '${pkg.name}';`,
		`import type { ProExtensionModule, ProSeriesDefinition } from '${pkg.name}';`,
		`import { createVNInvestChartsHost } from '${pkg.name}/iframe-host';`,
		`import * as adapters from '${pkg.name}/adapters';`,
		`import * as drawing from '${pkg.name}/drawing';`,
		`import { VERSION } from '${pkg.name}/types';`,
		// Namespace-importing the drawing subpath does NOT prove its types are
		// nameable: `import * as ns` succeeds even when a referenced type is
		// inlined as a non-exported declaration. Naming them does. The engine
		// packages ship declarations produced by dts-bundle-generator, which
		// inlines referenced types unless --export-referenced-types is on, so
		// this is the gate that catches a regression there.
		`import type { DrawingObject, DrawingToolType, DrawingStyle, CycleParams, MagnetSensitivity } from '${pkg.name}/drawing';`,

		// The React half of the former src/lib/drawing surface. Phase 5 moved it to
		// engine-react; if src/drawing-shim.ts ever stops re-exporting these, every
		// one disappears from the published subpath and JavaScript consumers get
		// `undefined` at runtime instead of a compile error.
		`import {
			AlertNotificationToast, DrawingContextMenu, FloatingSelectionToolbar, filterDrawingsByScope, renderDrawingToSvg, useDrawingAlertEvaluator, useDrawingInteraction, useDrawingStorage, useDrawingWorkspaceController, useLongPress,
		} from '${pkg.name}/drawing';`,
		`import type {
			AlertNotificationToastProps, DrawingAlertToastItem, DrawingDockTab, DrawingStorageErrorInfo, DrawingStorageOperation, DrawingWorkspaceController, DrawingWorkspaceState, DrawingWorkspaceTool, LongPressHandlers, UseDrawingAlertEvaluatorOptions, UseDrawingInteractionReturn, UseDrawingStorageOptions, UseDrawingStorageReturn, UseDrawingWorkspaceControllerOptions, UseLongPressOptions,
		} from '${pkg.name}/drawing';`,
		// …and a few symbols that exist ONLY in the migrated engine. Without
		// these the five type names above pass against the published 1.1.0 fork
		// too, so the gate stays green while a real consumer — who resolves
		// engine-drawing from the registry — gets a dead drawing panel. These
		// are absent from engine-drawing@1.1.0, verified against its dist d.ts.
		`import { TOOL_CAPABILITY_REGISTRY, isTypingTarget, buildToolCoverageMatrix, resolveSemanticPointLabels, isForkSupportedDrawingAuthoringTool } from '${pkg.name}/drawing';`,
		'',
		`export const v: string = version;`,
		`export const runtimeVersion: string = VERSION;`,
		`export const host = createVNInvestChartsHost;`,
		`export const proGate = [registerProExtension, isProExtensionActive];`,
		`export type ProModule = ProExtensionModule;`,
		`export type ProSeriesDef = ProSeriesDefinition;`,
		`export const adapterNs = adapters;`,
		`export const drawingNs = drawing;`,
		`export type P = VNInvestChartsProps | VNInvestMultiChartsProps;`,
		`export type D = DrawingObject;`,
		`export type T = DrawingToolType;`,
		`export type S = DrawingStyle;`,
		`export type C = CycleParams;`,
		`export type M = MagnetSensitivity;`,
		`export const capabilityCount = Object.keys(TOOL_CAPABILITY_REGISTRY).length;`,
		`export const t = isTypingTarget;`,
		`export const cov = buildToolCoverageMatrix;`,
		`export const sem = resolveSemanticPointLabels;`,
		`export const forkOk = isForkSupportedDrawingAuthoringTool;`,
		`export const reactHalf = [AlertNotificationToast, DrawingContextMenu, FloatingSelectionToolbar, filterDrawingsByScope, renderDrawingToSvg, useDrawingAlertEvaluator, useDrawingInteraction, useDrawingStorage, useDrawingWorkspaceController, useLongPress];`,
		`export type ReactHalf0 = AlertNotificationToastProps;`,
		`export type ReactHalf1 = DrawingAlertToastItem;`,
		`export type ReactHalf2 = DrawingDockTab;`,
		`export type ReactHalf3 = DrawingStorageErrorInfo;`,
		`export type ReactHalf4 = DrawingStorageOperation;`,
		`export type ReactHalf5 = DrawingWorkspaceController;`,
		`export type ReactHalf6 = DrawingWorkspaceState;`,
		`export type ReactHalf7 = DrawingWorkspaceTool;`,
		`export type ReactHalf8 = LongPressHandlers;`,
		`export type ReactHalf9 = UseDrawingAlertEvaluatorOptions;`,
		`export type ReactHalf10 = UseDrawingInteractionReturn;`,
		`export type ReactHalf11 = UseDrawingStorageOptions;`,
		`export type ReactHalf12 = UseDrawingStorageReturn;`,
		`export type ReactHalf13 = UseDrawingWorkspaceControllerOptions;`,
		`export type ReactHalf14 = UseLongPressOptions;`,
		`export const C1 = VNInvestCharts;`,
		`export const C2 = VNInvestMultiCharts;`,
		''
	].join('\n'), 'utf8');

	// paths: mỗi subpath trỏ thẳng vào artifact trong tarball đã giải nén
	const paths = {};

	// …cộng thêm 3 package engine, trỏ vào engine đang được sửa (VN_ENGINE_REPO).
	// Không làm vậy thì fixture resolve engine qua node_modules — tức là bản
	// đã publish, không phải bản dưới test — nên gate này có thể xanh trong khi
	// bản thật thiếu symbol. Dùng lại đúng bản đồ mà type-check đang dùng.
	//
	// The map is generated and no longer tracked, so "absent" is a normal state on a
	// fresh clone rather than the operator forgetting a step. Regenerate it here
	// instead of throwing: this script is also a documented manual entry point
	// (`npm run verify:consumer`), and depending on a sibling job having run
	// `pretype-check` first is exactly the ordering coupling that leaves a gate green
	// for the wrong reason.
	//
	// With no usable engine checkout the generator emits NO engine entries, the loop
	// below adds none, and the fixture resolves engine from its own node_modules —
	// which is the correct published-package behaviour for CI and consumers.
	const enginePathsFile = join(ROOT, 'tsconfig.engine-paths.json');
	if (!existsSync(enginePathsFile)) {
		execFileSync(process.execPath, [join(ROOT, 'scripts', 'gen-engine-tsconfig-paths.mjs')], {
			cwd: ROOT,
			stdio: 'ignore',
		});
		if (!existsSync(enginePathsFile)) {
			throw new Error(
				'gen-engine-tsconfig-paths did not produce tsconfig.engine-paths.json',
			);
		}
	}
	// File starts with `//` banner lines, which JSON.parse will not accept.
	const enginePaths = JSON.parse(
		readFileSync(enginePathsFile, 'utf8')
			.split('\n')
			.filter((l) => !l.trimStart().startsWith('//'))
			.join('\n'),
	).compilerOptions.paths;
	for (const [specifier, targets] of Object.entries(enginePaths)) {
		if (specifier.startsWith('@vninvestcharts/engine-')) {
			paths[specifier] = targets.map((t) => join(ROOT, t));
		}
	}
	console.log(`  OK engine packages pinned to: ${Object.keys(paths).filter((k) => k.includes('engine')).join(', ')}`);
	for (const ep of Object.keys(pkg.exports)) {
		const spec = pkg.exports[ep];
		if (typeof spec === 'string') continue;
		const target = (spec.types ?? spec.import).replace(/^\.\//, '');
		const key = ep === '.' ? pkg.name : `${pkg.name}/${ep.replace(/^\.\//, '')}`;
		paths[key] = [join(pkgDir, target).replace(/\\/g, '/')];
	}

	const tsconfig = {
		compilerOptions: {
			target: 'ES2020',
			module: 'ESNext',
			moduleResolution: 'Bundler',
			jsx: 'react-jsx',
			strict: true,
			noEmit: true,
			// Standard consumer setting. The gate under test is THIS package's
			// declaration tree; the twin engine packages are separately published
			// and have their own quality gates (see ledger ENGINE_DIST_DTS_DEFECTS).
			skipLibCheck: true,
			esModuleInterop: true,
			paths,
			typeRoots: [join(ROOT, 'node_modules', '@types')],
		},
		include: ['src/**/*.ts'],
	};
	writeFileSync(join(WORK, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2), 'utf8');

	console.log('  compiling consumer fixture (strict, skipLibCheck for engine peer dts) ...');
	try {
		run(NPX, ['tsc', '-p', join(workRel, 'tsconfig.json')]);
	} catch (err) {
		throw new Error(`consumer tsc failed:\n${err.stdout || ''}${err.stderr || ''}`);
	}
	console.log('  OK consumer compiled against tarball declarations');
	console.log('  OK drawing types are nameable (not inlined as non-exported decls)');

	console.log('\nPASS consumer-smoke: tarball layout + strict consumer compile verified');
} catch (err) {
	fail(err.message);
} finally {
	rmSync(WORK, { recursive: true, force: true });
}
