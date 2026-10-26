#!/usr/bin/env node
/**
 * check-slice-overlap.self-test.cjs — negative proof for the Stage 0.5 gate.
 *
 * The skill's rule: "write a negative test for every gate. A gate you have only seen
 * pass is an untested gate." This injects each violation class into a THROWAWAY COPY of
 * the plan (never the real one) and asserts the gate exits non-zero.
 *
 * Usage: node scripts/check-slice-overlap.self-test.cjs
 * Exit 0 = the gate really gates.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PLAN_REL = "docs/upgrade-standard/plans/PLAN_RELEASE_B4_2026-10-04.md";
const PLAN = path.join(ROOT, PLAN_REL);
const GATE = path.join(__dirname, "check-slice-overlap.cjs");

const original = fs.readFileSync(PLAN, "utf8");
const tmp = path.join(os.tmpdir(), `slice-overlap-selftest-${process.pid}.md`);

// Every shipped plan that HAS a parseable slice table must pass. One control plan was not
// enough: when the BULK rule was first added it reddened a RELEASED plan
// (PLAN_G3_DEFER_GATE_HARDEN_B2_2026-10-05.md) while the single control still passed, and
// the commit claimed no shipped plan had been affected. A sweep is the only thing that
// catches a rule that is too strict for plans nobody re-reads.
const PLANS_DIR = path.join(ROOT, "docs/upgrade-standard/plans");

/** Every `.md` under plans/, RECURSIVELY. A one-level readdir would silently drop a plan
 *  committed into a subdirectory - the sweep would then report a smaller number and still
 *  look green, which is the "quietly covers less than it claims" failure mode. */
function allPlanMarkdown(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const abs = path.join(dir, entry.name);
		if (entry.isDirectory()) allPlanMarkdown(abs, out);
		else if (entry.name.endsWith(".md")) out.push(abs);
	}
	return out;
}

/** Plans with a parseable slice table. The gate exits 1 on "no slice rows parsed", which
 *  is a parse failure, not a policy failure - those plans predate the table format. */
function shippedPlansWithSliceTables() {
	const out = [];
	for (const abs of allPlanMarkdown(PLANS_DIR)) {
		if (!/^\|\s*\*\*S\d+\*\*/m.test(fs.readFileSync(abs, "utf8"))) continue;
		out.push(abs);
	}
	return out.sort();
}

const CASES = [
	{
		name: "OVERLAP: same file claimed by two slices",
		mutate: (t) =>
			t.replace(
				"| **S3** CI + backlog close-out | B11 close-out + B13 backlog entry | `.github/workflows/ci.yml`",
				"| **S3** CI + backlog close-out | B11 close-out + B13 backlog entry | `Dockerfile`, `.github/workflows/ci.yml`",
			),
		expect: "OVERLAP",
	},
	{
		name: "DENY: worker claims a deny-listed file",
		mutate: (t) =>
			t.replace(
				"| **S2** runtime union | B4 — 11 declarations + the §2.2 consumers | `src/widget/VNInvestChartsProps.ts`",
				"| **S2** runtime union | B4 — 11 declarations + the §2.2 consumers | `src/widget/VNInvestCharts.tsx`, `src/widget/VNInvestChartsProps.ts`",
			),
		expect: "DENY",
	},
	{
		name: "MISSING: claimed file does not exist on disk",
		mutate: (t) =>
			t.replace(
				"| **S3** CI + backlog close-out | B11 close-out + B13 backlog entry | `.github/workflows/ci.yml`",
				"| **S3** CI + backlog close-out | B11 close-out + B13 backlog entry | `src/does/not/exist.ts`, `.github/workflows/ci.yml`",
			),
		expect: "MISSING",
	},
	{
		name: "EMPTY: slice row the parser cannot read a file out of",
		mutate: (t) =>
			t.replace(
				"| **S3** CI + backlog close-out | B11 close-out + B13 backlog entry | `.github/workflows/ci.yml`, `docs/upgrade-standard/BACKLOG_2026-10-04.md` | coordinator |",
				"| **S3** CI + backlog close-out | B11 close-out + B13 backlog entry | no paths listed here | coordinator |",
			),
		expect: "EMPTY",
	},
	{
		// Rule 4. The hazard: a plan names a command that rewrites dozens of files, and this
		// gate only validates CLAIMED paths, so every unclaimed file it writes slips into a
		// commit that no gate objects to. Measured with `eslint --fix-dry-run --format json`
		// (a file changes iff its JSON entry has `output`), intersected with
		// `config/fat-file-budget.json` -> `frozenBudgets`: 37 files, 10 of them frozen.
		// Those figures DRIFT; re-derive before quoting them. An earlier comment here said
		// "38 files, 5 with frozen budgets" and both halves were stale.
		//
		// Prose alone did not stop any of this - the previous wave wrote "`npm run lint:fix`
		// is FORBIDDEN" in a claim note and enforced nothing.
		name: "BULK: plan invokes a bulk-write command without claiming what it writes",
		mutate: (t) =>
			t.replace(
				"| **S3** CI + backlog close-out | B11 close-out + B13 backlog entry |",
				"| **S3** CI + backlog close-out | B11 close-out + B13 backlog entry | run `npm run lint:fix` first |",
			),
		expect: "BULK",
	},
	{
		// The escape hatch must actually work, or the rule is unusable and every compliant
		// plan would have to be mangled. A line that says FORBIDDEN is a DECLARATION that the
		// command will not be run, which is the opposite of invoking it.
		name: "BULK escape hatch: the same line marked FORBIDDEN is accepted",
		mutate: (t) =>
			t.replace(
				"| **S3** CI + backlog close-out | B11 close-out + B13 backlog entry | `.github/workflows/ci.yml`",
				"| **S3** CI + backlog close-out | B11 close-out + B13 backlog entry | `npm run lint:fix` is FORBIDDEN here | `.github/workflows/ci.yml`",
			),
		expect: null, // must PASS
	},
];

function runGate(planPath) {
	const r = spawnSync(process.execPath, [GATE, planPath], { encoding: "utf8" });
	return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

let failures = 0;
try {
	// 0. control: the real plan must PASS, or the rest proves nothing
	const control = runGate(PLAN);
	if (control.code !== 0) {
		console.error(`FAIL  control: the real plan does not pass the gate (exit ${control.code})`);
		console.error(control.out);
		failures += 1;
	} else {
		console.log(`ok    control: real plan passes (exit 0)`);
	}

	// 1. regression sweep: the BULK rule must not redden any shipped plan.
	//
	// Scoped to BULK on purpose. A blanket "every shipped plan is green" check is wrong:
	// two plans from 2026-09-23/30 are ALREADY red under the original three rules
	// (OVERLAP / DENY / MISSING on paths that have since moved or been renamed). That
	// pre-existing redness is not this gate's to fix, and folding it in would make the
	// self-test fail for reasons nobody can act on - a gate that always fails is ignored.
	//
	// What must be zero is: shipped plans red *because of the rule added in this wave*.
	// That is exactly what went unnoticed when the rule first landed and reddened
	// PLAN_G3_DEFER_GATE_HARDEN_B2_2026-10-05.md while the single control plan passed.
	const BULK_MARKER = "FAIL: BULK";

	/* The sweep, as a FUNCTION of the plan list - so the self-test can drive it with a
	 * deliberately violating list and prove it reports something.
	 *
	 * It was inline code in round 3, and audit round 3 defeated it two ways with one token
	 * each: `for (const p of shipped)` -> `for (const p of [])`, and the marker
	 * `"FAIL: BULK"` -> `"FAIL: BULKX"`. Both left the self-test green while a shipped plan
	 * was red. Extracting it means the "does it bite?" case below exercises the SAME code
	 * path, so neutering the loop now fails the self-test instead of hiding in it.
	 *
	 * Returns { bulkRed, alreadyRed, sawAnyPlan }. */
	function sweepBulkRed(plans) {
		let bulkRed = 0;
		let alreadyRed = 0;
		let sawAnyPlan = false;
		const offenders = [];
		const bulkDetail = [];
		for (const p of plans) {
			sawAnyPlan = true;
			const r = runGate(p);
			if (r.code === 0) continue;
			const bulk = r.out.split("\n").filter((l) => l.includes(BULK_MARKER));
			if (bulk.length) {
				bulkRed += 1;
				// Reported by the CALLER, which knows whether this plan is a shipped one or
				// the throwaway bite fixture. Printing here mixed the two: a passing
				// self-test still emitted "FAIL plan reddened..." for a fixture that was
				// supposed to fail, which reads as a failure and trains readers to skim.
				for (const w of bulk.slice(0, 3)) bulkDetail.push(w.trim());
				offenders.push(path.relative(ROOT, p));
			} else {
				alreadyRed += 1;
			}
		}
		return { bulkRed, alreadyRed, sawAnyPlan, offenders, bulkDetail };
	}

	// 1a. non-vacuity of the inputs: a non-empty list, and a marker that a green plan
	// does not trip.
	const shipped = shippedPlansWithSliceTables();
	if (shipped.length === 0) {
		console.error("FAIL  sweep is vacuous: found 0 shipped plans with a slice table");
		failures += 1;
	}
	if (runGate(PLAN).out.includes(BULK_MARKER)) {
		console.error("FAIL  sweep marker is wrong: a GREEN plan reported a BULK failure");
		failures += 1;
	}

	// 1b. the sweep must BITE. Drive the same function with a list containing a plan that
	// violates BULK and assert it reports bulkRed === 1. Without this the sweep is
	// decoration that can report "0 of N reddened" forever.
	const bitePath = path.join(os.tmpdir(), `slice-overlap-bite-${process.pid}.md`);
	const bitePlan = original.replace(
		"| **S3** CI + backlog close-out | B11 close-out + B13 backlog entry |",
		"| **S3** CI + backlog close-out | B11 close-out + B13 backlog entry | run `npm run lint:fix` |",
	);
	try {
		if (bitePlan === original) {
			console.error("FAIL  sweep bites: could not build the BULK-violating fixture (pattern drifted)");
			failures += 1;
		} else {
			fs.writeFileSync(bitePath, bitePlan, "utf8");
			const bite = sweepBulkRed([bitePath]);
			if (bite.bulkRed === 1 && bite.sawAnyPlan) {
				console.log("ok    sweep bites: a BULK-violating plan is reported (bulkRed=1)");
			} else {
				console.error(
					`FAIL  sweep bites: expected bulkRed=1, got ${bite.bulkRed} (sawAnyPlan=${bite.sawAnyPlan})`,
				);
				failures += 1;
			}
		}
	} finally {
		fs.rmSync(bitePath, { force: true });
	}

	// 1c. the sweep over the real shipped plans.
	const real = sweepBulkRed(shipped);
	if (real.bulkRed === 0) {
		console.log(
			`ok    regression sweep: 0 of ${shipped.length} shipped plan(s) reddened by BULK` +
				`${real.alreadyRed ? ` (${real.alreadyRed} pre-existing red under the older rules, out of scope)` : ""}`,
		);
	} else {
		for (const o of real.offenders) console.error(`FAIL  shipped plan reddened by the BULK rule: ${o}`);
		for (const w of real.bulkDetail) console.error(`      ${w}`);
		console.error(`FAIL  regression sweep: ${real.bulkRed} shipped plan(s) reddened by BULK`);
		failures += real.bulkRed;
	}

	for (const c of CASES) {
		const mutated = c.mutate(original);
		if (mutated === original) {
			console.error(`FAIL  ${c.name} — mutation did not change the plan (pattern drifted)`);
			failures += 1;
			continue;
		}
		fs.writeFileSync(tmp, mutated, "utf8");
		const r = runGate(tmp);

		// `expect: null` marks a case that must PASS. Without that branch, a rule with an
		// escape hatch has no proof the hatch works, and a gate that cannot be satisfied
		// gets bypassed rather than obeyed.
		const good =
			c.expect === null
				? r.code === 0
				: r.code !== 0 && r.out.includes(c.expect);

		if (good) {
			console.log(
				c.expect === null
					? `ok    ${c.name} -> exit ${r.code}, accepted as expected`
					: `ok    ${c.name} -> exit ${r.code}, reported ${c.expect}`,
			);
		} else {
			console.error(
				c.expect === null
					? `FAIL  ${c.name} -> exit ${r.code} (expected zero; the escape hatch is broken)`
					: `FAIL  ${c.name} -> exit ${r.code} (expected non-zero + "${c.expect}")`,
			);
			console.error(r.out.split("\n").slice(0, 12).join("\n"));
			failures += 1;
		}
	}
} finally {
	fs.rmSync(tmp, { force: true });
}

if (failures > 0) {
	console.error(`\ncheck-slice-overlap SELF-TEST FAILED: ${failures} case(s). The gate is not trusted.`);
	process.exit(1);
}
console.log(
	`\ncheck-slice-overlap SELF-TEST PASS: ${CASES.length} case(s) as specified, control accepted.`,
);
process.exit(0);