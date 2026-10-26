#!/usr/bin/env node
/**
 * CI reference integrity — every `npm run <script>` and `node <file>` in a
 * workflow must resolve to something that exists.
 *
 * WHY THIS EXISTS. Two workflows once ran `npm run test:parity-shared` and
 * `npm run test:parity-fork-extended`. Neither name ever existed in package.json
 * (`git log -S 'test:parity-shared' -- package.json` is empty), so those steps
 * could only ever have failed, and nobody noticed for as long as the workflows
 * lived. They were deleted upstream in dbc8c57, which fixed that instance and
 * nothing else: the next typo lands identically, and a step that names a
 * missing script fails at run time with npm's "Missing script" message buried
 * in a log nobody reads until the pipeline is already red.
 *
 * Checking this at review time turns a red pipeline into a one-line diff.
 *
 * SCOPE AND LIMITS, stated rather than glossed over:
 *   - This is a LINE scanner, not a YAML parser. That is sufficient for these
 *     workflows, which use plain scalars and block scalars only. If a workflow
 *     ever adopts anchors/merge keys (`&x` / `*x` / `<<:`), a reference could
 *     hide inside a value this scanner never sees, so the file is reported as
 *     UNSCANNABLE-CONSTRUCT and a human is asked to look. It is never silently
 *     trusted. Verified 2026-10-01: ci.yml, deploy.yml, deploy-prod.yml and
 *     release.yml contain no anchors and no merge keys.
 *   - Comment lines are skipped. A reference inside a `#` comment is not a step,
 *     and ci.yml:36-38 documents a decision using exactly that shape
 *     (`# ... Replace with plain \`npm run lint\` ...`).
 *   - Only `npm run` is resolved against package.json. Bare `npm ci`, `npm test`,
 *     `npm pack` and `npm publish` are npm builtins, not package scripts, and
 *     are deliberately out of scope.
 *
 * Usage: node scripts/check-script-existence.mjs
 * Exit:  0 every reference resolves · 1 at least one does not
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const here = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(here, "..")
const workflowsDir = path.join(rootDir, ".github", "workflows")
const packageJsonPath = path.join(rootDir, "package.json")

// `npm run <name>`, tolerating the flag forms npm accepts (`-s`, `--silent`).
const NPM_RUN_RE = /\bnpm\s+run\s+(?:-{1,2}[A-Za-z][\w-]*\s+)*([A-Za-z0-9:._-]+)/g

// `node <file>` where the target is a JS file. Captured with any leading
// directory so `node scripts/x.js`, `node ./scripts/x.js` and `node build-all.js`
// all resolve. Deliberately does not match `node -v` / `node --version`.
const NODE_FILE_RE = /\bnode\s+(?:-{1,2}[A-Za-z][\w-]*\s+)*((?:\.{0,2}[\\/])?[A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)*\.(?:[cm]?js))\b/g

// Constructs this line scanner cannot see through.
const YAML_BLIND_SPOTS = [
	{ re: /^\s*<<:/m, label: "merge key (<<:)" },
	{ re: /:\s+&\w+/, label: "anchor (&name)" },
	{ re: /:\s+\*\w+/, label: "alias (*name)" },
]

function loadNpmScripts() {
	const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"))
	return new Set(Object.keys(manifest.scripts ?? {}))
}

function listWorkflowFiles() {
	if (!existsSync(workflowsDir)) {
		return []
	}

	return readdirSync(workflowsDir)
		.filter((name) => /\.ya?ml$/i.test(name))
		.sort()
}

/**
 * Pull every reference out of one workflow, in file order.
 *
 * Scanning the whole file line by line (rather than only `run:` values) is what
 * makes multi-line `run: |` blocks work: the commands inside them are indented
 * plain lines, and a parser-free scan does not need to know where the block
 * began. The cost is that a reference inside a folded or indented non-command
 * string would also be picked up, which is the conservative direction to err
 * in — a false positive is one line of output, a false negative is a red build.
 */
function extractReferences(relativeFile, contents) {
	const references = []

	contents.split(/\r\n|\n|\r/).forEach((rawLine, index) => {
		const line = rawLine.trim()
		const lineNumber = index + 1

		if (line === "" || line.startsWith("#")) {
			return
		}

		for (const match of line.matchAll(NPM_RUN_RE)) {
			references.push({
				file: relativeFile,
				line: lineNumber,
				kind: "npm-script",
				target: match[1],
				raw: line,
			})
		}

		for (const match of line.matchAll(NODE_FILE_RE)) {
			references.push({
				file: relativeFile,
				line: lineNumber,
				kind: "node-file",
				target: match[1].replace(/^\.\//, "").replace(/\\/g, "/"),
				raw: line,
			})
		}
	})

	return references
}

function findBlindSpots(contents) {
	return YAML_BLIND_SPOTS.filter((spot) => spot.re.test(contents)).map((spot) => spot.label)
}

function verdictFor(reference, npmScripts) {
	if (reference.kind === "npm-script") {
		return npmScripts.has(reference.target)
			? { ok: true, detail: `package.json scripts.${reference.target}` }
			: { ok: false, detail: "no such script in package.json" }
	}

	const absolute = path.join(rootDir, reference.target)
	return existsSync(absolute)
		? { ok: true, detail: "file exists on disk" }
		: { ok: false, detail: "no such file in the repo" }
}

function main() {
	const npmScripts = loadNpmScripts()
	const workflowFiles = listWorkflowFiles()

	if (workflowFiles.length === 0) {
		console.error(`check-script-existence: no workflow files under ${path.relative(rootDir, workflowsDir)}`)
		return 1
	}

	const missing = []
	const blindSpots = []
	let checked = 0

	for (const name of workflowFiles) {
		const contents = readFileSync(path.join(workflowsDir, name), "utf8")

		for (const label of findBlindSpots(contents)) {
			blindSpots.push({ file: name, label })
		}

		for (const reference of extractReferences(name, contents)) {
			checked += 1
			const { ok, detail } = verdictFor(reference, npmScripts)
			const at = `${reference.file}:${reference.line}`
			console.log(`${ok ? "OK     " : "MISSING"} ${at}  ${reference.kind} ${reference.target}  (${detail})`)
			if (!ok) {
				missing.push({ ...reference, detail })
			}
		}
	}

	console.log("")
	console.log(`check-script-existence: ${checked} reference(s) across ${workflowFiles.length} workflow file(s), ${npmScripts.size} script(s) in package.json`)

	for (const spot of blindSpots) {
		console.log(`WARN  ${spot.file}: uses ${spot.label} — this line scanner cannot see references that hide there; review it by hand.`)
	}

	if (missing.length === 0) {
		console.log("check-script-existence: PASS (every workflow reference resolves)")
		return 0
	}

	console.error(`\ncheck-script-existence: FAIL — ${missing.length} workflow reference(s) do not resolve:\n`)
	for (const reference of missing) {
		console.error(`  ${reference.file}:${reference.line}  ${reference.kind} "${reference.target}" — ${reference.detail}`)
		console.error(`      line: ${reference.raw}`)
	}
	console.error(
		"\nA step naming a script or file that does not exist cannot pass. It fails at run\n" +
			"time with the reason buried in a log, which is how test:parity-shared and\n" +
			"test:parity-fork-extended survived review until dbc8c57 deleted their workflows.\n" +
			"Either add the script to package.json or fix the step to name one that exists.",
	)
	return 1
}

process.exitCode = main()