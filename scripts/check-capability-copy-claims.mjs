#!/usr/bin/env node
/**
 * G-PINE-COPY — capability upsell copy must not advertise behaviour that does not exist.
 *
 * WHY THIS EXISTS
 * On 2026-10-08 the Pine capability copy shipped three claims that were false against the
 * code on disk, to paying customers, on a `pro`-tier capability:
 *   - "ta.*, math.*, strategy.* and request.security so real scripts compile"
 *       -> `strategy.*` and `request.security` had ZERO dispatcher cases.
 *   - "Backtest a script and export the trade list."
 *       -> the strategy tester runs four hard-coded strategies and has no export control.
 *   - "Write your own indicators and strategies in the chart."
 *       -> a Pine series never reached the chart at all.
 *
 * A single "no unknown symbol" rule would have caught only the FIRST of those three. The
 * other two name no dispatcher symbol, so they slip through a symbol-only gate. That is why
 * this file has three rules and not one.
 *
 * RULES (each must hold for BOTH en and vi)
 *   1. SYMBOL      a copy string must not name a Pine namespace/function that the dispatcher
 *                  does not implement.
 *   2. OBSERVABLE  a copy string must not promise an observable outcome that the feature
 *                  cannot currently produce (checked against an explicit forbidden list,
 *                  because "unobservable" is not mechanically decidable).
 *   3. MIRROR      `scripts/verify-capability-gate.cjs` keeps a verbatim copy of the VI
 *                  strings and asserts the DOM matches. If the i18n file changes and that
 *                  mirror does not, that gate goes red on a string that is now CORRECT.
 *                  Rule 3 makes the coupling visible from this side too.
 *
 * EXIT CODES
 *   0  pass (or `--self-test` succeeded)
 *   1  at least one claim is unsupported
 *   2  a file this gate reads is missing
 *
 * Usage:  node scripts/check-capability-copy-claims.mjs [--self-test]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EN_FILE = path.join(ROOT, "src/widget/i18n/capability.messages.en.ts");
const VI_FILE = path.join(ROOT, "src/widget/i18n/capability.messages.vi.ts");
// W-00 (PINE Stage 4): `callFunction` was MOVED out of `compile.ts` into
// `pineBuiltins.ts` by Stage 3 W-02 (fat-file split). This constant was never
// updated, so Rule 1 lost its anchor and the gate started failing with exit 2
// (`MISSING: export function callFunction anchor`) — a failure nobody saw,
// because `scripts/run-gates.cjs` did not call this gate at all.
//
// Proof it was green before the move (both at base 216a8cd):
//   git show 216a8cd:src/lib/pinescript/compile.ts | Select-String "export function callFunction"
//   git show 216a8cd:scripts/check-capability-copy-claims.mjs | Select-String "const DISPATCHER"
//
// So this is a REGRESSION introduced by Pine Stage 3, not pre-existing debt.
//
// DO NOT "fix" it by deleting the anchor check or by moving the function back.
// The anchor is what stops Rule 1 from silently degrading into a gate that
// passes while verifying nothing (the script says so at the `anchor === -1`
// branch). Fix the PATH, not the rule.
const DISPATCHER = path.join(ROOT, "src/lib/pinescript/pineBuiltins.ts");
const STRINGS = path.join(ROOT, "src/lib/pinescript/pineStrings.ts");
const MIRROR = path.join(ROOT, "scripts/verify-capability-gate.cjs");

function readOrDie(file) {
	if (!fs.existsSync(file)) {
		console.error(`MISSING: ${path.relative(ROOT, file)}`);
		process.exit(2);
	}
	return fs.readFileSync(file, "utf8");
}

/**
 * Names the Pine dispatcher actually implements. Computed, never hardcoded: a hardcoded
 * list is a second source of truth that drifts, which is how the original false claim
 * survived in the first place.
 *
 * Two traps this had to learn the hard way (round 2, after an audit REJECT):
 *  - `case 'abs': case 'math.abs':` puts SEVERAL labels on ONE line. Reading only the first
 *    label per line silently lost 8 implemented `math.*` functions, which then made the gate
 *    report supported copy as unsupported.
 *  - The same `switch` also switches on AST node types (`case 'Literal'`, `case 'Assignment'`,
 *    ...). Those are NOT functions. Counting them inflated a headline number by 13.
 * So: take every label on every line, then keep only lowercase namespaced or bare names.
 */
function implementedSymbols() {
	const dispatcher = readOrDie(DISPATCHER);
	const anchor = dispatcher.indexOf("export function callFunction");
	if (anchor === -1) {
		// Silently degrading here would disarm Rule 1 and still print PASS. Fail loudly.
		//
		// The path is derived from DISPATCHER, never spelled out again. This message used
		// to hardcode `compile.ts` and kept naming that file after DISPATCHER had been
		// repointed — so the diagnostic pointed the next debugger at a file the gate no
		// longer reads. A wrong error message is worse than none: it is confidently wrong
		// and it survives every "run the gate and read the output" check.
		console.error(`MISSING: \`export function callFunction\` anchor in ${path.relative(ROOT, DISPATCHER)}`);
		console.error("        Rule 1 cannot verify symbols without it — refusing to pass.");
		process.exit(2);
	}
	const body = dispatcher.slice(anchor);
	const symbols = new Set();
	for (const line of body.split("\n")) {
		for (const m of line.matchAll(/case '([^']+)'/g)) {
			const name = m[1];
			// Namespaced (ta.sma) or a bare lowercase builtin (nz, fixnan). Excludes AST types.
			if (/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(name) || /^[a-z][a-z0-9_]*$/.test(name)) {
				symbols.add(name);
			}
		}
	}
	const strings = readOrDie(STRINGS);
	const block = strings.match(/STR_BUILTINS\s*=\s*\[([\s\S]*?)\]/);
	if (!block) {
		console.error("MISSING: STR_BUILTINS array in pineStrings.ts");
		process.exit(2);
	}
	for (const m of block[1].matchAll(/'([^']+)'/g)) symbols.add(m[1]);
	if (symbols.size === 0) {
		console.error("MISCONFIGURED: no Pine symbols extracted — refusing to pass on an empty set.");
		process.exit(2);
	}
	return symbols;
}

/**
 * Pine namespaces a copy string may mention. If copy names one of these and the dispatcher
 * does not implement it, the copy is lying. Note `input.`/`color.`/`time.` are included:
 * round 1 whitelisted only ta/math/str, so `color.new` slipped through untouched.
 */
const PINES_NAMESPACES = ["ta.", "math.", "str.", "strategy.", "request.", "barstate.", "input.", "color.", "time."];

/**
 * Names a copy string may never promise. Every entry is justified in the comment, so a future
 * reader can check the justification rather than trust it.
 *
 * Deliberately written as CONCEPT patterns, not as the exact sentence that was wrong. Round 1
 * banned the literal "in the chart", then the copy was reworded to "to your chart" and sailed
 * straight through — the gate protecting its own author from his own rewrite.
 */
const FORBIDDEN = [
	{
		pattern: /\bstrateg(?:y|ies)\b[\s\S]{0,40}\bin\b\s+(?:the\s+)?chart|\bin\s+(?:the\s+)?chart\b[\s\S]{0,40}\bstrateg(?:y|ies)\b/i,
		why: "a Pine strategy cannot be plotted: there is no strategy.* in the dispatcher",
	},
	{
		pattern: /\b(?:add|added|adding|render|draw|plot|appear|show)\w*\b[\s\S]{0,40}\b(?:in|on|to|onto)\s+(?:the|your)\s+(?:chart|graph)/i,
		why: "a Pine series never reaches the chart: see PLAN_PINE_PARITY_2026-10-08 §2.1",
	},
	{
		pattern: /\bexport\b[\s\S]{0,30}\b(?:trade|list|report|csv|png)/i,
		why: "StrategyTesterPanel.tsx has one button (run backtest) and no export control",
	},
	{
		pattern: /\b(?:download|save|persist|sync)\w*\b[\s\S]{0,30}\b(?:cloud|server|account|device)/i,
		why: "scripts live in localStorage only; there is no cloud sync (PLAN §2.5)",
	},
	{
		pattern: /\bmulti[-\s]?timeframe\b|\brequest\.security\b/i,
		why: "no request.* in the dispatcher; multi-timeframe is unimplemented",
	},
];

/** Pull the upsell copy values for the Pine-related capabilities out of one messages file. */
function pineCopyValues(file) {
	const src = readOrDie(file);
	const wanted = [
		"capability.upsell.pine_editor",
		"capability.upsell.pine_functional",
		"capability.upsell.strategy_tester",
	];
	const found = [];
	for (const key of wanted) {
		const re = new RegExp(`"${key.replace(/\./g, "\\.")}\\.(title|benefit)":\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g");
		for (const m of src.matchAll(re)) found.push({ key: `${key}.${m[1]}`, value: m[2] });
	}
	return found;
}

function check() {
	const problems = [];
	const implemented = implementedSymbols();

	for (const file of [EN_FILE, VI_FILE]) {
		const rel = path.relative(ROOT, file).replace(/\\/g, "/");
		const entries = pineCopyValues(file);
		if (entries.length === 0) {
			problems.push(`${rel}: no Pine upsell copy found — did the keys change?`);
			continue;
		}
		for (const { key, value } of entries) {
			// Rule 1 — unknown symbol.
			for (const m of value.matchAll(/\b([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)/g)) {
				const sym = m[1];
				if (PINES_NAMESPACES.some((ns) => sym.startsWith(ns)) && !implemented.has(sym)) {
					problems.push(`${rel} ${key}: names "${sym}" which the dispatcher does NOT implement`);
				}
			}
			// Rule 2 — unobservable promise.
			for (const { pattern, why } of FORBIDDEN) {
				if (pattern.test(value)) {
					problems.push(`${rel} ${key}: promises something unobservable — ${why}`);
				}
			}
			// Rule 2b — a function COUNT in copy must match the measured count. Round 1 shipped
			// "69 built-in functions" straight out of a broken counter. If copy states a number,
			// the gate owns that number now.
			const countMatch = value.match(/\b(\d{1,4})\s+(?:built-in\s+)?(?:functions?|hàm)\b/i);
			if (countMatch) {
				const claimed = Number(countMatch[1]);
				const namespaced = [...implemented].filter((s) => s.includes(".")).length;
				if (claimed !== namespaced) {
					problems.push(
						`${rel} ${key}: claims ${claimed} functions but the dispatcher implements ` +
						`${namespaced} namespaced ones — measured, not asserted`
					);
				}
			}
		}
	}

	// Rule 3 — VI mirror inside verify-capability-gate.cjs must not drift from the i18n file.
	//
	// Direction matters: the mirror is a SUBSET by design. That E2E gate only asserts the two
	// capabilities it actually renders in the DOM, so demanding it mirror every Pine key would be
	// this rule failing on correct code — which is what the first version of this gate did.
	// The invariant that actually protects us is one-directional: whatever the mirror DOES declare
	// must equal the i18n value, because that literal is what the DOM assertion compares against.
	const mirror = readOrDie(MIRROR);
	const mirrorBlock = mirror.match(/const VI = \{[\s\S]*?\n\};/);
	if (!mirrorBlock) {
		problems.push("scripts/verify-capability-gate.cjs: could not find the `const VI = {...}` mirror block");
	} else {
		for (const { key, value } of pineCopyValues(VI_FILE)) {
			const shortKey = key.replace("capability.upsell.", "");
			// Only enforce for keys the mirror declares at all.
			if (!mirrorBlock[0].includes(`${shortKey.split(".")[0]}: {`)) continue;
			if (!mirrorBlock[0].includes(value)) {
				problems.push(
					`scripts/verify-capability-gate.cjs does not mirror ${key} — that gate asserts the DOM ` +
					`against this literal, so the two must move in the same commit`
				);
			}
		}
	}

	return { problems, implementedCount: implemented.size };
}

/**
 * A gate only ever seen passing is untested.
 *
 * Round 1's self-test looped over 3 hard-coded strings and asked whether FORBIDDEN matched
 * them — it never called check(), so neutering check() to `return {problems: []}` left the
 * self-test still printing PASS. A safety net that cannot notice the thing it guards is
 * decoration.
 *
 * This version mutates the REAL i18n file, runs the REAL check(), and asserts it goes red.
 * It restores the file afterwards, and verifies the restore.
 */
function selfTest() {
	const target = EN_FILE;
	const original = fs.readFileSync(target, "utf8");
	const cases = [
		["rule 1  unknown symbol", "Write scripts with ta.sma, math.abs and color.new today."],
		["rule 2  chart promise", "Write your own indicators and add them to your chart."],
		["rule 2  chart promise reworded", "Indicators you write will appear right on the graph."],
		["rule 2  export promise", "Backtest a script and export your trades to CSV."],
		["rule 2b wrong function count", "120 built-in functions across ta.* and math.*."],
	];
	let failures = 0;
	try {
		for (const [name, injected] of cases) {
			// Replace the first benefit string with the injected claim.
			const mutated = original.replace(
				/("capability\.upsell\.pine_editor\.benefit":\s*")((?:[^"\\]|\\.)*)(")/,
				(_m, a, _old, b) => a + injected.replace(/"/g, '\\"') + b
			);
			if (mutated === original) {
				console.error(`SELF-TEST BROKEN: could not inject for "${name}" — anchor not found`);
				failures++;
				continue;
			}
			fs.writeFileSync(target, mutated);
			const { problems } = check();
			if (problems.length === 0) {
				console.error(`SELF-TEST BROKEN: "${name}" did NOT trip a rule — the gate is inert`);
				failures++;
			}
		}
	} finally {
		fs.writeFileSync(target, original);
	}
	// The restore must be real, and the clean tree must pass.
	const restored = fs.readFileSync(target, "utf8") === original;
	const { problems, implementedCount } = check();
	if (!restored) {
		console.error("SELF-TEST BROKEN: i18n file was not restored");
		failures++;
	}
	if (problems.length > 0) {
		console.error(`SELF-TEST BROKEN: clean tree does not pass — ${problems.length} problem(s)`);
		failures++;
	}
	if (implementedCount <= 0) {
		console.error("SELF-TEST BROKEN: implementedCount is 0 — Rule 1 is disarmed");
		failures++;
	}
	if (failures > 0) {
		console.error(`self-test: ${failures} negative case(s) FAILED`);
		process.exit(1);
	}
	console.log(
		`PASS: self-test ran the real check() and tripped all ${cases.length} injected violations; ` +
		`file restored; clean tree passes with ${implementedCount} symbols.`
	);
	process.exit(0);
}

if (process.argv.includes("--self-test")) selfTest();

const { problems, implementedCount } = check();
if (problems.length > 0) {
	console.error(`FAIL: ${problems.length} capability copy claim(s) not supported by code:`);
	for (const p of problems) console.error(`  - ${p}`);
	process.exit(1);
}
console.log(
	`PASS: Pine capability copy is supported by code (${implementedCount} implemented symbols checked).`
);
