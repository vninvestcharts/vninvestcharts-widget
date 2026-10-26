const fs = require("fs")
const path = require("path")

// REGRESSION LOCK for Phase 1 of
// docs/upgrade-standard/plans/PLAN_DRAWING_SSOT_MIGRATION_2026-09-27.md
//
// src/lib/drawing must be self-contained: no module inside it may import
// anything outside the directory. That is what makes Phase 2 possible - the
// files get copied verbatim into engine-drawing, so an import of "../utils/..."
// or "../types/..." would drag widget-only code into the engine package.
//
// Deliberately narrow: it fails only on specifiers that resolve outside
// src/lib/drawing.
//   - relative ("../utils/x", "./x") -> resolved against the file
//   - alias ("@lib/anything")        -> resolved against src/, because the
//     webpack/vitest alias @lib -> src/lib would otherwise be a silent hole
// Bare package specifiers (@vninvestcharts/engine-core, react, ...) are allowed
// on purpose - those are real package boundaries and engine-drawing declares
// them itself.
//
// Usage: node scripts/check-drawing-import-boundary.js
// Exit:  0 clean · 1 at least one escaping import

const rootDir = path.resolve(__dirname, "..")
const drawingDir = path.join(rootDir, "src", "lib", "drawing")
const srcDir = path.join(rootDir, "src")
const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g

// @lib -> src/lib (webpack + vitest alias). Anything under @lib that is not
// @lib/drawing/... leaves the drawing directory.
const ALIAS_PREFIX = "@lib/"

function toPosixPath(value) {
	return value.split(path.sep).join("/")
}

function walkFiles(currentPath, files) {
	if (!fs.existsSync(currentPath)) {
		return files
	}

	for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === "dist") {
			continue
		}

		const nextPath = path.join(currentPath, entry.name)
		if (entry.isDirectory()) {
			walkFiles(nextPath, files)
			continue
		}

		if (/\.(ts|tsx)$/.test(entry.name)) {
			files.push(nextPath)
		}
	}

	return files
}

function resolveWithExtensions(targetPath) {
	const candidates = [
		targetPath,
		`${targetPath}.ts`,
		`${targetPath}.tsx`,
		path.join(targetPath, "index.ts"),
		path.join(targetPath, "index.tsx"),
	]
	return candidates.some((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
}

// Only a directory that still holds files is a violation. Git does not track
// empty directories, so deleting the sources leaves an empty husk behind - and
// failing on the husk turns every fresh clone of a merged branch into a red
// build for no reason.
const leftover = fs.existsSync(drawingDir) ? fs.readdirSync(drawingDir) : [];
if (leftover.length > 0) {
	console.error(
		`drawing import boundary: FAIL — src/lib/drawing exists again (${leftover.length} entries).\n\n` +
			"  The drawing implementation was migrated to the engine twin repo on 2026-09-27\n" +
			"  (PLAN_DRAWING_SSOT_MIGRATION_2026-09-27). This repo must resolve drawing only\n" +
			"  through @vninvestcharts/engine-drawing / @vninvestcharts/engine-react. Re-creating\n" +
			"  a local copy re-introduces the duplicate the migration was meant to remove.",
	)
	process.exit(1)
}
if (fs.existsSync(drawingDir)) {
	// Harmless husk, but it makes `Test-Path` style checks report the directory
	// as present, so remove it to keep the tree honest.
	fs.rmdirSync(drawingDir)
}

const violations = []
const files = walkFiles(drawingDir, [])

// Second lock: nothing anywhere in src/ may reach drawing through a path that
// bypasses the engine packages. A local drawing module can only come back as
// `@lib/drawing/...` (or a relative path that happens to point at it), and
// those are the specifiers Phase 4's codemod was meant to eliminate.
const reimports = []
// The path the migration deleted. Relative imports are compared against this
// exact directory, not against the word "drawing".
const deletedDrawingDir = drawingDir
for (const filePath of walkFiles(srcDir, [])) {	const content = fs.readFileSync(filePath, "utf8")
	IMPORT_PATTERN.lastIndex = 0
	let match = IMPORT_PATTERN.exec(content)
	while (match !== null) {
		const specifier = match[1]
		let offending = null

		if (specifier === "@lib/drawing" || specifier.startsWith("@lib/drawing/")) {
			offending = specifier
		} else if (specifier.startsWith(".")) {
			// Resolve the specifier and test it against the one directory that was
			// deleted. Matching on the substring "drawing" would also flag the
			// unrelated, still-legitimate src/widget/components/drawing/.
			const resolved = path.resolve(path.dirname(filePath), specifier)
			if (resolved === deletedDrawingDir || resolved.startsWith(deletedDrawingDir + path.sep)) {
				offending = specifier
			}
		}

		if (offending !== null) {
			const line = content.slice(0, match.index).split(/\r\n|\n|\r/).length
			reimports.push(`${toPosixPath(path.relative(rootDir, filePath))}:${line}  "${offending}"`)
		}
		match = IMPORT_PATTERN.exec(content)
	}
}
if (reimports.length > 0) {
	console.error(
		`drawing import boundary: FAIL — ${reimports.length} import(s) bypass the engine packages\n`,
	)
	for (const entry of reimports) console.error(`  ${entry}`)
	console.error(
		"\nImport drawing via @vninvestcharts/engine-drawing (logic) or\n" +
			"@vninvestcharts/engine-react (UI) instead. See AGENTS.md Rule 16.",
	)
	process.exit(1)
}

for (const filePath of files) {
	const content = fs.readFileSync(filePath, "utf8")
	IMPORT_PATTERN.lastIndex = 0

	let match = IMPORT_PATTERN.exec(content)
	while (match !== null) {
		const specifier = match[1]
		let resolved = null

		if (specifier.startsWith(".")) {
			resolved = path.resolve(path.dirname(filePath), specifier)
		} else if (specifier === ALIAS_PREFIX.slice(0, -1) || specifier.startsWith(ALIAS_PREFIX)) {
			// @lib/drawing/... stays inside; any other @lib/... is an escape
			resolved = path.resolve(srcDir, "lib", specifier.slice(ALIAS_PREFIX.length))
		}

		if (resolved !== null) {
			const inside = resolved === drawingDir || resolved.startsWith(drawingDir + path.sep)
			if (!inside) {
				const line = content.slice(0, match.index).split(/\r\n|\n|\r/).length
				violations.push({
					file: toPosixPath(path.relative(rootDir, filePath)),
					line,
					specifier,
					target: toPosixPath(path.relative(rootDir, resolved)),
					exists: resolveWithExtensions(resolved),
				})
			}
		}
		match = IMPORT_PATTERN.exec(content)
	}
}

if (violations.length === 0) {
	console.log("drawing import boundary: PASS (src/lib/drawing absent, 0 local drawing imports)")
	process.exit(0)
}
console.error(`drawing import boundary: FAIL — ${violations.length} import(s) leave src/lib/drawing\n`)
for (const violation of violations) {
	const missing = violation.exists ? "" : "  [target does not even resolve to a file]"
	console.error(`  ${violation.file}:${violation.line}  "${violation.specifier}" -> ${violation.target}${missing}`)
}
console.error("\nEvery src/lib/drawing module must be self-contained so Phase 2 can copy it")
console.error("into engine-drawing. Port the needed helper in, or move the consumer out.")
process.exit(1)
