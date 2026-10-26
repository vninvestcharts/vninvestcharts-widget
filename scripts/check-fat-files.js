const fs = require("fs")
const path = require("path")

const rootDir = path.resolve(__dirname, "..")
// `FAT_FILE_BUDGET_CONFIG` exists so `--self-test` can point the child at a TEMP
// copy. The self-test must never write the tracked budget file: `finally` does
// not run on SIGINT/SIGKILL, so a tracked file mutated by a test is one killed
// matrix away from being committed with a root silently unmeasured.
const configPath = process.env.FAT_FILE_BUDGET_CONFIG
	? path.resolve(process.env.FAT_FILE_BUDGET_CONFIG)
	: path.join(rootDir, "config", "fat-file-budget.json")

// Fail-closed argument handling (2026-10-01).
//
// The engine scan used to be a SILENT SKIP: `scanEngineAdvisory` returned false
// when the engine checkout was absent and the gate exited 0 having measured
// nothing. A typo'd path therefore produced exactly the same green result as a
// real pass. Proven at 405b12a:
//     node scripts/check-fat-files.js "C:\nonexistent-engine-xyz"  ->  exit 0
// A gate that cannot fail is not a gate, so absence now fails by default.
//
//   --allow-missing-engine   opt out and treat an absent engine as
//                            "not applicable". Defaults to OFF. A caller that
//                            legitimately runs without an engine checkout
//                            (CI, registry consumer) must say so explicitly.
//                            Does NOT apply when an engine was NAMED on the
//                            command line or via VN_ENGINE_REPO: that is a typo
//                            or a stale worktree, never a legitimate absence,
//                            and the opt-out must not be able to hide it.
const ALLOW_MISSING_ENGINE = "--allow-missing-engine"
const argv = process.argv.slice(2)
const engineArg = argv.find((arg) => arg !== ALLOW_MISSING_ENGINE)
const allowMissingEngine = argv.includes(ALLOW_MISSING_ENGINE)
const engineExplicitlyNamed = Boolean(engineArg || process.env.VN_ENGINE_REPO)

// Set when the engine checkout is required but absent. Reported in the failure
// summary so the reason a gate went red is never left to be guessed at.
let engineMissing = null

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function toPosixPath(value) {
	return value.split(path.sep).join("/")
}

function isTestFile(relativePath) {
	return /(^|\/)(__tests__|.*\.(test|spec))\.(ts|tsx|js|jsx)$/.test(relativePath)
}

function countLines(filePath) {
	const content = fs.readFileSync(filePath, "utf8")
	if (content.length === 0) {
		return 0
	}

	return content.split(/\r\n|\n|\r/).length
}

function walkFiles(currentPath, extensions, files) {
	const entries = fs.readdirSync(currentPath, { withFileTypes: true })
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build" || entry.name === "storybook-static") {
			continue
		}

		const nextPath = path.join(currentPath, entry.name)
		if (entry.isDirectory()) {
			walkFiles(nextPath, extensions, files)
			continue
		}

		if (extensions.has(path.extname(entry.name))) {
			files.push(nextPath)
		}
	}
}

function resolveBudget(relativePath, config) {
	const frozenBudget = config.frozenBudgets[relativePath]
	if (typeof frozenBudget === "number") {
		return {
			maxLines: frozenBudget,
			kind: "frozen"
		}
	}

	return {
		maxLines: isTestFile(relativePath) ? config.defaultMaxLines.test : config.defaultMaxLines.source,
		kind: "default"
	}
}

function isIgnored(relativePath, config) {
	return Array.isArray(config.ignorePrefixes)
		&& config.ignorePrefixes.some((prefix) => relativePath.startsWith(prefix))
}

function scanEngineAdvisory(config, extensions) {
	// Rule 12 twin-repo visibility (BL-02: promoted from advisory to GATE after
	// the 2026-09-24 budget sync). The widget budget cannot see the engine
	// because `packages/` lives in the sibling `vninvestcharts-engine` repo,
	// so it is scanned here against the same frozenBudgets keys
	// (`packages/<pkg>/...`). Violations now FAIL the check (exit code 1).
	//
	// Usage: node scripts/check-fat-files.js [engine-repo-path] [--allow-missing-engine]
	// The path argument exists because a git worktree of the engine is not at
	// ../vninvestcharts-engine: without it the gate silently reports "passed"
	// while measuring a completely different checkout (2026-09-27, while
	// copying the drawing sources into an engine worktree).
	// VN_ENGINE_REPO is honoured too, matching check-engine-timestamp.js and
	// check-package-side-effects.js. It used to be ignored here, so a caller who
	// set it was silently measuring the sibling checkout instead - the same
	// wrong-checkout bug one indirection away.
	// An engine that is named but not usable is a hard failure that
	// --allow-missing-engine CANNOT bypass; an engine that is merely absent needs
	// the flag to be tolerated.
	const engineRepo = engineArg || process.env.VN_ENGINE_REPO || path.join("..", "vninvestcharts-engine")
	const engineDir = path.resolve(rootDir, engineRepo, "packages")
	if (!fs.existsSync(engineDir)) {
		if (allowMissingEngine && !engineExplicitlyNamed) {
			console.log(`engine check: SKIPPED by ${ALLOW_MISSING_ENGINE} (${toPosixPath(engineDir)} not found)`)
			return false
		}

		engineMissing = toPosixPath(engineDir)
		if (engineExplicitlyNamed && allowMissingEngine) {
			console.error(`engine check: FAILED - ${ALLOW_MISSING_ENGINE} does not apply, an engine was named explicitly but is unusable`)
		} else {
			console.error(`engine check: FAILED - no engine checkout at ${engineMissing}`)
		}
		return true
	}

	const files = []
	walkFiles(engineDir, extensions, files)
	const advisories = []
	for (const filePath of files) {
		const relativePath = toPosixPath(path.join("packages", path.relative(engineDir, filePath)))
		if (isIgnored(relativePath, config)) {
			continue
		}

		const lines = countLines(filePath)
		const budget = resolveBudget(relativePath, config)
		if (lines > budget.maxLines) {
			advisories.push({ relativePath, lines, maxLines: budget.maxLines, kind: budget.kind })
		}
	}

	if (advisories.length === 0) {
		console.log("engine check passed: no over-budget engine files")
		return false
	}

	console.error("\nengine budget check failed:\n")
	for (const advisory of advisories) {
		console.error(`- ${toPosixPath(engineRepo)}/${advisory.relativePath}: ${advisory.lines} lines -> ${advisory.kind} budget ${advisory.maxLines} exceeded`)
	}
	return true
}

function main() {
	const config = readJson(configPath)
	const extensions = new Set(config.extensions)
	const files = []
	// A configured root that does not exist used to be skipped with a bare
	// `continue` and no output. That makes this gate weaker than it reads: the
	// summary says "all tracked files are within budget" while a whole root went
	// unmeasured, and renaming a root would silently disable it. `packages` was
	// in that state — it is not tracked at HEAD (the engine lives in the sibling
	// repo since DRAWING_SSOT_MIGRATION_2026-09-27), so this was not
	// hypothetical.
	//
	// Reported, not fatal: a consumer checkout may legitimately lack a root. The
	// number of skipped roots is printed on EVERY run, in the pass line as well
	// as a warning, so "this gate read fewer files than it claims" is visible
	// without anyone having to diff the config against the tree.
	const missingRoots = []

	for (const root of config.roots) {
		const absoluteRoot = path.join(rootDir, root)
		if (!fs.existsSync(absoluteRoot)) {
			missingRoots.push(root)
			continue
		}

		walkFiles(absoluteRoot, extensions, files)
	}

	const violations = []
	for (const filePath of files) {
		const relativePath = toPosixPath(path.relative(rootDir, filePath))
		if (isIgnored(relativePath, config)) {
			continue
		}

		const lines = countLines(filePath)
		const budget = resolveBudget(relativePath, config)
		if (lines > budget.maxLines) {
			violations.push({
				relativePath,
				lines,
				maxLines: budget.maxLines,
				kind: budget.kind
			})
		}
	}

	const engineFailed = scanEngineAdvisory(config, extensions)

	for (const missing of missingRoots) {
		console.warn(
			`WARNING: configured root '${missing}' does not exist and was skipped. ` +
			`${files.length} file(s) were measured in total WITHOUT it. ` +
			"If this root was renamed, this gate is now weaker than it reports."
		)
	}

	if (violations.length === 0 && !engineFailed) {
		console.log(
			`fat-file check passed: ${files.length} file(s) measured, all within budget` +
			(missingRoots.length ? ` (${missingRoots.length} configured root(s) missing: ${missingRoots.join(", ")})` : "")
		)
		return
	}

	console.error("fat-file check failed:\n")
	for (const violation of violations) {
		const reason = violation.kind === "frozen"
			? `frozen budget exceeded (${violation.maxLines})`
			: `default budget exceeded (${violation.maxLines})`
		console.error(`- ${violation.relativePath}: ${violation.lines} lines -> ${reason}`)
	}

	console.error("\nRule: file mới phải dưới ngưỡng mặc định; file fat hiện hữu bị freeze và không được tăng thêm line count nếu chưa cập nhật plan/budget.")

	if (engineMissing) {
		console.error(`\n- engine: no checkout at ${engineMissing}`)
		console.error(
			"  The engine half of this gate measured nothing, so the widget-only\n" +
			"  result above cannot stand in for a real pass. Point the gate at an\n" +
			"  engine checkout:\n" +
			"    node scripts/check-fat-files.js <engine-repo-path>\n" +
			"  or, to run widget budgets alone and accept that the engine was not\n" +
			"  checked, pass the explicit opt-in:\n" +
			`    node scripts/check-fat-files.js ${ALLOW_MISSING_ENGINE}`,
		)
	}

	process.exitCode = 1
}

/**
 * Negative proof for the missing-root report (AC-C3).
 *
 * A gate that has only ever been seen passing is untested. This renames a root
 * and asserts the warning appears and that the reported count reflects the lost
 * coverage — i.e. that a root going missing is visible instead of a silent
 * shrink.
 *
 * TWO THINGS THIS VERSION GOT WRONG, both caught by review, both worth the note:
 *
 *  1. It asserted a HARD-CODED file count (95). Adding one `.js` file under
 *     `scripts/` flips that to 94 and turns the whole matrix red for a reason
 *     that has nothing to do with the code under test. The assertion below is
 *     therefore a RELATION between two runs, which stays true as the repo grows.
 *
 *  2. It wrote the mutation into the TRACKED `config/fat-file-budget.json` and
 *     restored it in `finally`. `finally` does not run on SIGINT/SIGKILL, so an
 *     interrupted matrix could leave `src` unmeasured and the next `git commit -a`
 *     would publish it — which is the exact failure this gate exists to expose.
 *     The child now reads a TEMP COPY via `FAT_FILE_BUDGET_CONFIG`, so an
 *     interrupted run cannot damage the repo at all.
 */
function selfTest() {
	const os = require("os")
	const { spawnSync } = require("child_process")
	const original = fs.readFileSync(configPath, "utf8")
	let bad = 0
	const check = (name, ok, detail = "") => {
		console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`)
		if (!ok) bad += 1
	}

	// Parse "N file(s) were measured in total WITHOUT it." out of the warning.
	const countFrom = (out) => {
		const m = out.match(/(\d+) file\(s\) were measured in total WITHOUT it/)
		return m ? Number(m[1]) : null
	}

	/** Run the gate against a given config file. The repo's own config is never written. */
	const runWith = (configFile, extraArgs = []) => {
		const r = spawnSync(process.execPath, [__filename, ...extraArgs, ALLOW_MISSING_ENGINE], {
			cwd: rootDir,
			encoding: "utf8",
			maxBuffer: 32 * 1024 * 1024,
			env: { ...process.env, FAT_FILE_BUDGET_CONFIG: configFile },
		})
		return { out: `${r.stdout || ""}${r.stderr || ""}`, status: r.status }
	}
	// NOTE: extraArgs go BEFORE the flag so cases can name an engine while the
	// flag is still present (proves the flag cannot bypass a named engine).

	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fat-file-selftest-"))
	const mutatedPath = path.join(tmpDir, "fat-file-budget.mutated.json")
	try {
		// The control runs FIRST: a fixture that is not load-bearing proves nothing.
		const control = runWith(configPath).out
		const controlCount = countFrom(control)
		check("control: the real config still passes", control.includes("fat-file check passed"))
		check(
			"control: the real config reports the known-missing root",
			/does not exist/.test(control),
			(control.match(/WARNING[^\n]*/) || [""])[0],
		)
		check("control: the warning carries a measurable count", controlCount !== null, `count=${controlCount}`)

		// Point a real root at a path that does not exist. `src` is the largest
		// root, so losing it must visibly shrink the measured total.
		const mutated = JSON.parse(original)
		mutated.roots = mutated.roots.map((r) => (r === "src" ? "src-does-not-exist-xyz" : r))
		fs.writeFileSync(mutatedPath, JSON.stringify(mutated, null, 2), "utf8")

		const out = runWith(mutatedPath).out
		const mutatedCount = countFrom(out)
		check(
			"negative: a renamed root is reported, not silently skipped",
			/src-does-not-exist-xyz/.test(out),
			(out.match(/WARNING[^\n]*/) || [""])[0],
		)
		check(
			"negative: losing `src` strictly shrinks the measured file count",
			controlCount !== null && mutatedCount !== null && mutatedCount < controlCount,
			`control=${controlCount} mutated=${mutatedCount}`,
		)

		// F-QUAL-04: the engine half must be load-bearing too. A fake engine
		// checkout under TEMP keeps these cases independent of any sibling
		// checkout, so they also run in CI (where no engine exists).
		const engTmp = fs.mkdtempSync(path.join(os.tmpdir(), "fat-file-eng-"))
		const engPkgDir = path.join(engTmp, "packages", "pkg-a")
		fs.mkdirSync(engPkgDir, { recursive: true })
		const engCfgPath = path.join(engTmp, "budget.json")
		fs.writeFileSync(engCfgPath, JSON.stringify({
			roots: [],
			extensions: [".ts"],
			defaultMaxLines: { test: 1200, source: 800 },
			frozenBudgets: {},
			ignorePrefixes: [],
		}), "utf8")
		const lines = (n) => Array.from({ length: n }, (_, i) => `// line ${i}`).join("\n") + "\n"
		try {
			// (a) A NAMED engine that is absent fails closed even WITH the flag.
			const namedAbsent = runWith(configPath, ["C:\\nonexistent-engine-xyz-abc"])
			check(
				"engine: named-but-absent fails closed despite the flag",
				namedAbsent.status !== 0 && /does not apply/.test(namedAbsent.out),
				`exit=${namedAbsent.status}`,
			)

			// (b) An over-budget file in a named checkout fails, naming the file.
			fs.writeFileSync(path.join(engPkgDir, "big.ts"), lines(900), "utf8")
			const over = runWith(engCfgPath, [engTmp])
			check(
				"engine: over-budget file in a named checkout fails naming it",
				over.status !== 0 && /pkg-a\/big\.ts/.test(over.out),
				`exit=${over.status}`,
			)

			// (c) A within-budget named checkout passes the engine half.
			fs.rmSync(path.join(engPkgDir, "big.ts"))
			fs.writeFileSync(path.join(engPkgDir, "small.ts"), lines(10), "utf8")
			const under = runWith(engCfgPath, [engTmp])
			check(
				"engine: within-budget named checkout passes the engine half",
				under.status === 0 && /engine check passed/.test(under.out),
				`exit=${under.status}`,
			)
		} finally {
			fs.rmSync(engTmp, { recursive: true, force: true })
		}
		check("finally: engine temp dir removed", !fs.existsSync(engTmp))
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true })
		// Assert the tracked config is untouched rather than assuming it.
		const after = fs.readFileSync(configPath, "utf8")
		check("finally: temp dir removed", !fs.existsSync(tmpDir))
		check("finally: the TRACKED config was never modified", after === original, after === original ? "" : "DRIFT")
	}

	console.log(`\ncheck-fat-files SELF-TEST ${bad === 0 ? "PASS" : "FAIL"}: ${bad} case(s) failed`)
	process.exit(bad === 0 ? 0 : 1)
}

if (argv.includes("--self-test")) {
	selfTest()
} else {
	main()
}