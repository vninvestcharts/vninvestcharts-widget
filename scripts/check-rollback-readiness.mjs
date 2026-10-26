#!/usr/bin/env node
/**
 * check-rollback-readiness.mjs — VER-03: prove the rollback PATH exists.
 *
 * A rollback runbook that nobody has executed is a wish, not a control. This
 * script mechanically asserts the invariants that make a rollback possible, so
 * a future change that silently removes one of them fails CI instead of being
 * discovered during an incident.
 *
 * Every check maps to a real failure mode that was present in the repo on
 * 2026-09-25 (see RUNBOOK_ROLLBACK_OBSERVABILITY.md §1):
 *   - an unversioned shell asset served with `expires 1y; immutable` means a
 *     rollback re-shipping the same filename is invisible to browsers;
 *   - `docker image prune -f` after deploy deletes the rollback image;
 *   - a version endpoint that is generated but never served cannot answer
 *     "which version is the customer on?".
 *
 * This is a STATIC check of the deployment contract. It does not deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const failures = [];
const notes = [];

// Inspect executable lines only. A checker that can be satisfied by its own
// explanatory comment is not a checker: the comment below that documents the
// prune bug literally contains the string "docker image prune -f".
const code = (src) =>
	src
		.split('\n')
		.map((l) => l.replace(/#.*$/, ''))
		.join('\n');

const check = (name, ok, detail) => {
	if (ok) {
		notes.push(`  PASS  ${name}`);
	} else {
		failures.push(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
};

// --- 1. nginx must not put the embed shell behind a long immutable cache ----
const nginx = read('deploy/nginx-app.conf');

// The shell block must use `^~`; without it nginx prefers the generic asset
// regex over this plain prefix location.
const iframeBlock = nginx.match(/location\s+(\^~\s+)?\/iframe\//);
check(
	'nginx /iframe/ location is pinned with ^~',
	Boolean(iframeBlock && iframeBlock[1]),
	'plain prefix loses to the `location ~* \\.(js|css|...)$` rule, so the shell inherits `expires 1y`',
);
check(
	'nginx /iframe/ forbids long-lived caching',
	/location\s+\^~\s+\/iframe\//.test(nginx) && /add_header\s+Cache-Control\s+"no-cache/.test(nginx),
	'shell assets are unversioned (build-all.js loads ./vninvestchart.iframe.js), so any max-age masks a rollback',
);

// --- 2. the shell asset name must not be content-hashed -------------------
// If it ever becomes hashed, the no-cache above is merely conservative; the
// runbook then documents a different policy. Keep both sides honest.
const buildAll = exists('build-all.js') ? read('build-all.js') : '';
const shellUsesFixedName = buildAll.includes('./vninvestchart.iframe.js');
check(
	'build emits the unversioned shell script name (matches runbook)',
	shellUsesFixedName,
	'shell filename changed — revisit the Cache-Control policy above and the runbook',
);

// --- 3. rollback image must survive the deploy step -----------------------
const deploy = read('.github/workflows/deploy.yml');
const deployCode = code(deploy);
check(
	'deploy does not prune the rollback candidate',
	!/\bdocker\s+image\s+prune\b/.test(deployCode) || /docker\s+image\s+prune[^\n]*--filter/.test(deployCode),
	'bare `docker image prune -f` deletes the previous image, making image-tag rollback impossible',
);
check(
	'deploy records the previous image id before swapping',
	/PREV_IMAGE=/.test(deployCode),
	'without the previous image id there is nothing to auto-revert to',
);
check(
	'deploy asserts health and auto-reverts on failure',
	/health\.json/.test(deployCode) && /exit 1/.test(deployCode) && /force-recreate/.test(deployCode),
	'verify step must poll the health endpoint and revert, not sleep and echo',
);

// --- 4. a "which version is live?" endpoint must be generated AND served ---
check('health generator exists', exists('scripts/generate-health.js'));
const healthInBuild = read('package.json').includes('generate-health.js');
check('build:docs produces health.json', healthInBuild, 'image would ship without /health.json');
check(
	'nginx serves /health.json',
	/location\s+=\s+\/health\.json/.test(nginx),
	'runbook tells support to read /health.json; it must be routable',
);
check('container healthcheck uses the same contract', read('Dockerfile').includes('/health.json'));

// --- 5. the version must be reachable on the surfaces support uses ---------
check(
	'iframe runtime reports its version to the host',
	/signalReady\(/.test(read('src/widget/iframe/iframeEntry.tsx')),
	'host cannot tell which iframe build it is embedded',
);

// --- 6. a runtime kill switch must exist that needs no rebuild -------------
const messageProtocol = read('src/widget/iframe/messageProtocol.ts');
check(
	'iframe host can disable the drawing UI without a rebuild',
	/drawingUiEnabled/.test(messageProtocol),
	'this is the primary no-deploy mitigation for a bad drawing regression',
);
const saas = read('src/widget/contexts/SaaSFeatureContext.tsx');
check(
	'backend entitlements can disable a Pro feature without a rebuild',
	/isReplayEnabled/.test(saas),
	'no server-side kill switch for Pro features',
);

// --- 7. release identity ----------------------------------------------------
check('release manifest is committed', exists('release-manifest.json'));
const versionSync = exists('scripts/sync-version.js') && read('package.json').includes('check:version');
check('version drift is gated in CI', versionSync);

console.log('rollback-readiness check\n');
for (const n of notes) console.log(n);
for (const f of failures) console.log(f);

console.log('');
if (failures.length > 0) {
	console.error(`rollback-readiness FAILED (${failures.length}/${notes.length + failures.length} checks):`);
	console.error(failures.join('\n'));
	process.exit(1);
}
console.log(`rollback-readiness PASS (${notes.length} checks).`);
