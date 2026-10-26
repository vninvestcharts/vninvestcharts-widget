#!/usr/bin/env node
/**
 * generate-release-manifest.js — release-manifest.json cho mỗi build (GOV-02).
 *
 * Nguồn duy nhất cho version là package.json. Manifest gom version + commit +
 * package engine twin-repo để host/telemetry/support đối chiếu được bản đang chạy.
 *
 * Engine versions come from package.json `dependencies`, NOT from a sibling
 * ../vninvestcharts-engine checkout. The engine is a REGISTRY dependency
 * (^1.3.0 / ^2.0.2), not a git submodule, so a sibling source checkout exists on
 * one developer's machine and nowhere else — reading it made the committed
 * manifest describe that workstation: in a tree without the sibling the same
 * generator wrote commit:"unknown" and all three engines "unavailable". Reading
 * what package.json declares is also what this file's own header already claimed.
 *
 * Usage:
 *   node scripts/generate-release-manifest.js            # ghi file
 *   node scripts/generate-release-manifest.js --check     # chỉ soát lệch, exit 1 nếu sai
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'release-manifest.json');
const CHECK_MODE = process.argv.includes('--check');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function gitCommit() {
	try {
		return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
	} catch {
		return 'unknown';
	}
}

function readJson(file) {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch {
		return null;
	}
}

function declaredRange(name) {
	const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies, pkg.peerDependencies);
	return deps[name];
}

/** "1.3.0" from "^1.3.0" / "~1.3.0" / "1.3.0" / ">=1.3.0 <2". */
function bareVersion(range) {
	if (!range) return 'undeclared';
	const m = String(range).match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
	return m ? m[1] : String(range);
}

const enginePackages = {};
for (const pkgName of ['engine-core', 'engine-react', 'engine-drawing']) {
	const key = `@vninvestcharts/${pkgName}`;
	enginePackages[key] = bareVersion(declaredRange(key));
}

const manifest = {
	name: pkg.name,
	version: pkg.version,
	commit: gitCommit(),
	engines: enginePackages,
	entryPoints: {
		esm: pkg.exports['.'].import,
		cjs: pkg.exports['.'].require,
		types: pkg.exports['.'].types,
		hostSdk: pkg.exports['./iframe-host'] ? pkg.exports['./iframe-host'].import : null,
		iframeRuntime: pkg.exports['./iframe'],
	},
	capabilities: {
		tiers: ['free', 'starter', 'pro', 'enterprise'],
		maxChartsByTier: { free: 2, starter: 2, pro: 4, enterprise: 'full' },
		replayTier: 'pro',
	},
	// VER-02: perf evidence travels with the manifest, so a release decision
	// can be made without re-measuring. Read from config (not dist) because CI
	// regenerates this file in a job that has no build output.
	bundleBudget: readJson(path.join(ROOT, 'config', 'bundle-baseline.json')),
};

const serialized = JSON.stringify(manifest, null, 2) + '\n';

if (CHECK_MODE) {
	if (!fs.existsSync(OUT_FILE)) {
		console.error('FAIL release-manifest.json missing. Run: node scripts/generate-release-manifest.js');
		process.exit(1);
	}
	const current = fs.readFileSync(OUT_FILE, 'utf8');

	// `commit` is SELF-REFERENTIAL: it is `git rev-parse HEAD`, and the file that
	// stores it cannot contain the hash of the commit that stores it. Byte-comparing
	// it meant a standalone check could never pass at any commit — the gate only
	// ever went green inside CI, where ci.yml regenerates at :100 immediately
	// before checking at :104, so the committed artifact was verified by nothing.
	// Mask `commit` on both sides and compare everything else exactly.
	const mask = (text) => {
		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch {
			return null;
		}
		if (!parsed || typeof parsed !== 'object') return null;
		delete parsed.commit;
		return JSON.stringify(parsed, null, 2) + '\n';
	};

	const currentMasked = mask(current);
	const expectedMasked = mask(serialized);

	if (currentMasked === null) {
		console.error('FAIL release-manifest.json is not valid JSON.');
		process.exit(1);
	}
	if (currentMasked !== expectedMasked) {
		console.error('FAIL release-manifest.json out of sync with package.json.');
		console.error('Run: node scripts/generate-release-manifest.js');
		process.exit(1);
	}

	const committedCommit = (readJson(OUT_FILE) || {}).commit;
	if (committedCommit && committedCommit !== 'unknown' && committedCommit !== manifest.commit) {
		// Informational, NOT a failure: the manifest was written by an earlier
		// commit, which is what a committed manifest necessarily records.
		console.log(`  note: manifest records commit ${String(committedCommit).slice(0, 7)}, HEAD is ${manifest.commit.slice(0, 7)}`);
	}
	console.log(`  OK release-manifest.json = ${manifest.version} (commit field not compared)`);
} else {
	fs.writeFileSync(OUT_FILE, serialized, 'utf8');
	console.log(`release-manifest.json written: ${manifest.name}@${manifest.version} (${manifest.commit.slice(0, 7)})`);
	for (const [k, v] of Object.entries(manifest.engines)) {
		console.log(`  engine ${k}: ${v}`);
	}
}
