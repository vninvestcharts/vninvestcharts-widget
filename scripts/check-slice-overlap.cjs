#!/usr/bin/env node
/**
 * check-slice-overlap.cjs — Stage 0.5 gate: prove slice file sets are DISJOINT.
 *
 * Precedent: docs/plans/COMM-2026-01/check-slice-overlap.cjs
 *
 * THE PLAN IS THE SINGLE SOURCE OF TRUTH. This script PARSES the slice table out of
 * the plan markdown. It deliberately keeps no list of its own: the previous version
 * did, and the Stage 2 audit refuted that as decorative -- the gate validated a
 * hardcoded array that had drifted from the plan in four places while still exiting 0
 * (skill: "a gate you have only seen pass is an untested gate"; hazard 4).
 * If you edit the plan's table, this script follows. If you edit this script's list,
 * nothing happens, because there is no list.
 *
 * Rules enforced (skill §0.5, skill Stage 3):
 *   1. No file may appear in two slices.
 *   2. A slice may claim a deny-listed file only if the table marks it coordinator-executed.
 *   3. Every claimed file must exist on disk (skill Stage 1: a plan citing a file that
 *      is not there is worse than no plan).
 *   4. A plan may not invoke a command that rewrites many files at once unless it claims
 *      them. See BULK_WRITE_COMMANDS below.
 *
 * Usage: node scripts/check-slice-overlap.cjs [plan-path]
 * Exit 0 = disjoint + legal. Exit 1 = otherwise.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const PLAN =
	process.argv[2] ?? path.join(ROOT, "docs/upgrade-standard/plans/PLAN_RELEASE_B4_2026-10-04.md");

const DENY_LIST = [
	"AGENTS.md",
	"CLAUDE.md",
	"CHANGELOG.md",
	"docs/upgrade-standard/AUDIT_LEDGER.md",
	"docs/CLAIMS.md",
	"config/fat-file-budget.json",
	"config/lint-baseline.json",
	"config/bundle-baseline.json",
	"config/hardcoded-text-baseline.json",
	"package.json",
	"package-lock.json",
	"src/demo/i18n.tsx",
	"src/widget/i18n/messages.en.ts",
	"src/widget/i18n/messages.vi.ts",
	"src/widget/VNInvestCharts.tsx",
	"tsconfig.json",
];

/* Rule 4 - bulk-write commands.
 *
 * A plan can name a command that rewrites dozens of files in one shot, and every file it
 * touches outside the slice table lands in a commit that no gate in this repo objects to:
 * `check-slice-overlap` only validates CLAIMED paths, so an unclaimed rewrite is invisible
 * by construction. That is the same blind spot as "claim nhưng không sửa" in the other
 * direction, and it is measurable rather than theoretical:
 *
 *   npx eslint --ext .js,.jsx,.ts,.tsx src --fix-dry-run --format json
 *     -> files whose `output` is present are exactly those the fixer would rewrite.
 *        Measured at 4ce1e99 + this wave: 37 files, 10 of them with frozen fat-file
 *        budgets (config/fat-file-budget.json -> frozenBudgets), warnings 419 -> 299.
 *
 *        These figures DRIFT as the tree changes, and a gate that prints a stale number is
 *        asserting something false. Re-derive before quoting them:
 *          node <script> measuring eslint `output` presence against frozenBudgets
 *        An earlier version of this comment said "38 files, 5 with frozen budgets"; both
 *        halves were wrong by the time it was read.
 *
 * So a plan that mentions one of these must either claim the files it writes, or say
 * explicitly that the command is forbidden. Prose alone is what let that through before.
 *
 * LIMIT, stated because the message used to promise more than the code does: the
 * "claim the files it writes" branch is NOT implemented. This script parses markdown and
 * cannot know what a command will touch, so it cannot verify that a claim is sufficient -
 * and a rule that offers a remedy it does not honour teaches readers to ignore it.
 * The only accepted resolutions are: mark the line FORBIDDEN, or remove the mention.
 *
 * KNOWN GAP, not fixed here: matching is by npm script name, so the raw form the hazard
 * actually describes - `npx eslint src --fix` - is invisible to it. Fixing that means
 * resolving commands to the files they write, which is a bigger gate than this one.
 *
 * Matched as a whole word so a plan can talk ABOUT the command ("`lint:fix` is FORBIDDEN
 * here") without tripping the rule - the escape hatch below is how.
 */
const BULK_WRITE_COMMANDS = [
	"lint:fix",
	"lint:fix-type",
	"lint:ratchet:update",
	"bundlesize:ratchet:update",
	// `release:manifest` is deliberately ABSENT. It writes exactly one file
	// (generate-release-manifest.js has a single writeFileSync -> release-manifest.json) and
	// the protocol expects it to be run, so it is not a bulk write. Including it reddened a
	// RELEASED plan (PLAN_G3_DEFER_GATE_HARDEN_B2_2026-10-05.md) for merely mentioning it.
	//
	// Note: an earlier version of this comment justified the removal by claiming
	// release-manifest.json "is already deny-listed". It is NOT in DENY_LIST below and not
	// in AGENT_PROTOCOL.md's list. The removal stands on the single-writeFileSync fact
	// above, not on that claim.
];
const FORBIDDEN_ESCAPE = "FORBIDDEN";

if (!fs.existsSync(PLAN)) {
	console.error(`check-slice-overlap FAIL: plan not found: ${PLAN}`);
	process.exit(1);
}

// --- parse the slice table -----------------------------------------------------
// Expected shape, one row per slice, `|`-delimited, slice id in column 1:
//   | **S1** release plumbing | B13 + B1 + … | `a.ts`, `b.ts` | coordinator | … |
const md = fs.readFileSync(PLAN, "utf8");
const slices = [];
for (const line of md.split(/\r?\n/)) {
	if (!/^\|\s*\*\*S\d+\*\*/.test(line)) continue;
	// Split on UNESCAPED pipes only. A markdown cell may contain `\|`; a naive
	// split("|") shifts every later cell by one, which silently mis-assigns the
	// files column to the scope column. Observed for real on the a2-union claim row,
	// whose scope cell contains `"legacy" \| "fork"`.
	const cells = line.split(/(?<!\\)\|/).slice(1, -1);
	if (cells.length < 3) continue;
	const id = (cells[0].match(/\*\*(S\d+)\*\*/) || [])[1];
	if (!id) continue;
	const ownerCell = cells[cells.length - 1];
	// Last cell is "Owner". A coordinator row names a person; a worker row says "worker".
	const coordinator = /coordinator/i.test(ownerCell) && !/parallel worker/i.test(ownerCell);
	// Files cell: the one containing the most backticked paths.
	let fileCell = "";
	let best = -1;
	for (const c of cells) {
		const n = (c.match(/`[^`]+`/g) || []).length;
		if (n > best) {
			best = n;
			fileCell = c;
		}
	}
	const files = [...fileCell.matchAll(/`([^`]+)`/g)]
		.map((m) => m[1].trim())
		// A claimed path never contains whitespace. Anything with a space is prose
		// ("no paths listed here"), anything with `*` is a glob — not a claim.
		//
		// Do NOT add an "has an extension" test here. An earlier version used
		// /[\\/]|\.[a-z]+$/ as the filter and silently dropped extensionless filenames
		// such as `Dockerfile` — so the gate UNDER-REPORTED claims, which is the
		// dangerous direction: a real overlap went undetected. Caught by
		// scripts/check-slice-overlap.self-test.cjs, which is why that script exists.
		.filter((f) => !/\s/.test(f) && !f.includes("*"));
	slices.push({ id, coordinator, files, raw: line.trim() });
}

if (slices.length === 0) {
	console.error(
		"check-slice-overlap FAIL: no slice rows parsed from the plan.\n" +
			"  Expected rows shaped: | **S1** name | scope | `file`, `file` | coordinator |",
	);
	process.exit(1);
}

const problems = [];
const warnings = [];
const owner = new Map();

for (const slice of slices) {
	if (slice.files.length === 0) {
		problems.push(`EMPTY    ${slice.id} claims no files — table row unreadable: ${slice.raw}`);
		continue;
	}
	for (const f of slice.files) {
		if (owner.has(f)) {
			problems.push(`OVERLAP  ${f} claimed by both ${owner.get(f)} and ${slice.id}`);
		} else {
			owner.set(f, slice.id);
		}
	}
}

for (const [file, sliceId] of owner) {
	if (!DENY_LIST.includes(file)) continue;
	const slice = slices.find((s) => s.id === sliceId);
	if (slice && slice.coordinator) {
		warnings.push(`deny-listed ${file} -> ${sliceId} (table marks it coordinator-executed, OK)`);
	} else {
		problems.push(
			`DENY     ${file} -> ${sliceId} is not coordinator-executed; a parallel worker may not commit it`,
		);
	}
}

for (const [file, sliceId] of owner) {
	if (!fs.existsSync(path.join(ROOT, file))) {
		problems.push(`MISSING  ${file} claimed by ${sliceId} does not exist`);
	}
}

// Rule 4: bulk-write commands. Scan the plan line by line so the escape hatch can be
// per-line - a plan that forbids the command in one paragraph and invokes it in another is
// still a problem, and that is exactly the shape worth catching.
for (const [i, line] of md.split(/\r?\n/).entries()) {
	for (const cmd of BULK_WRITE_COMMANDS) {
		if (!new RegExp(`\\b${cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(line)) continue;
		if (line.includes(FORBIDDEN_ESCAPE)) continue;
		problems.push(
			`BULK     plan:${i + 1} invokes \`${cmd}\`, which rewrites many files at once. ` +
				`Mark that line "${FORBIDDEN_ESCAPE}" if the command is only being discussed, ` +
				`or drop it from the plan. (Claiming the files it writes is NOT an option: ` +
				`this rule cannot tell which files a command will touch, so it rejects the ` +
				`mention either way - see the header.)`,
		);
	}
}

// --- report -------------------------------------------------------------------
const claimed = slices.reduce((n, s) => n + s.files.length, 0);
console.log(`plan: ${path.relative(ROOT, PLAN).replace(/\\/g, "/")}`);
console.log(`slices: ${slices.length}, claimed entries: ${claimed}, distinct files: ${owner.size}`);
for (const s of slices) {
	console.log(
		`  ${s.id}  ${String(s.files.length).padStart(2)} file(s)  ${s.coordinator ? "coordinator-executed" : "parallel worker"}`,
	);
}
for (const w of warnings) console.log(`  warn: ${w}`);
for (const p of problems) console.error(`  FAIL: ${p}`);

if (problems.length > 0) {
	console.error(`\ncheck-slice-overlap FAILED: ${problems.length} problem(s).`);
	process.exit(1);
}
console.log(
	"\ncheck-slice-overlap PASS: file sets are disjoint, deny-list respected, all files exist.",
);
process.exit(0);