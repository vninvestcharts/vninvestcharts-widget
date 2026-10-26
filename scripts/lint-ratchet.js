#!/usr/bin/env node
/**
 * lint-ratchet.js — VER-04: prevent lint debt from growing.
 *
 * Background: `npm run lint` is currently red repo-wide (see ledger R2-01), but
 * `ci.yml` runs it as a blocking step. A red gate that can never go green trains
 * people to ignore CI. This ratchet makes the gate *actionable*: CI fails only
 * when the number of problems INCREASES against a committed baseline, and every
 * file that the PR touches must be lint-clean.
 *
 * Usage:
 *   node scripts/lint-ratchet.js            # enforce (CI)
 *   node scripts/lint-ratchet.js --update   # rewrite baseline after reducing debt
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BASELINE = path.join(ROOT, 'config', 'lint-baseline.json');
// Invoke eslint through `node` directly (no shell): the repo path contains
// spaces, and `shell: true` does not escape arguments.
const ESLINT_JS = path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
const UPDATE = process.argv.includes('--update');

function runEslint() {
	const stdout = execFileSync(process.execPath, [ESLINT_JS, '--format', 'json', 'src'], {
		cwd: ROOT,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
		shell: false,
	});
	return JSON.parse(stdout);
}

function tally(results) {
	const byRule = {};
	let errors = 0;
	let warnings = 0;
	const filesWithErrors = [];
	for (const file of results) {
		if (file.errorCount > 0) filesWithErrors.push(path.relative(ROOT, file.filePath).replace(/\\/g, '/'));
		for (const m of file.messages) {
			if (m.severity === 2) {
				errors++;
				byRule[m.ruleId || 'unknown'] = (byRule[m.ruleId || 'unknown'] || 0) + 1;
			} else {
				warnings++;
			}
		}
	}
	return { errors, warnings, byRule, filesWithErrors: filesWithErrors.sort() };
}

let current;
try {
	current = tally(runEslint());
} catch (err) {
	// eslint exits 1 when problems exist; stdout is still valid JSON.
	if (!err.stdout) {
		console.error('lint-ratchet: failed to run eslint');
		process.exit(2);
	}
	try {
		current = tally(JSON.parse(err.stdout));
	} catch {
		console.error('lint-ratchet: could not parse eslint JSON output');
		process.exit(2);
	}
}

if (UPDATE || !fs.existsSync(BASELINE)) {
	fs.writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n', 'utf8');
	console.log(
		`lint-ratchet: baseline written — ${current.errors} errors, ${current.warnings} warnings, ` +
		`${current.filesWithErrors.length} files with errors`
	);
	process.exit(0);
}

const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const problems = [];

if (current.errors > base.errors) {
	problems.push(
		`error count grew: ${base.errors} -> ${current.errors} (+${current.errors - base.errors}). ` +
		`Fix the new errors, or (legit debt) run: node scripts/lint-ratchet.js --update`
	);
}

for (const [rule, count] of Object.entries(current.byRule)) {
	const was = base.byRule[rule] || 0;
	if (count > was) {
		problems.push(`rule '${rule}' grew: ${was} -> ${count} (+${count - was})`);
	}
}

const baseFiles = new Set(base.filesWithErrors);
const newBadFiles = current.filesWithErrors.filter((f) => !baseFiles.has(f));
if (newBadFiles.length > 0) {
	problems.push(
		`${newBadFiles.length} file(s) newly have errors (a newly touched file must be lint-clean):\n` +
		newBadFiles.map((f) => `  - ${f}`).join('\n')
	);
}

if (problems.length > 0) {
	console.error('lint-ratchet FAIL:\n' + problems.map((p) => `  * ${p}`).join('\n'));
	console.error(
		`\ncurrent: ${current.errors} errors / ${current.warnings} warnings | ` +
		`baseline: ${base.errors} / ${base.warnings}`
	);
	process.exit(1);
}

const delta = base.errors - current.errors;
console.log(
	`lint-ratchet PASS: ${current.errors} errors / ${current.warnings} warnings ` +
	`(baseline ${base.errors}/${base.warnings}` +
	`${delta > 0 ? `, ${delta} FIXED` : delta < 0 ? `, ${-delta} NEW` : ''}).`
);
