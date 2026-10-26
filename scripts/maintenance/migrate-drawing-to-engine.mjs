// Phase 4 codemod of PLAN_DRAWING_SSOT_MIGRATION_2026-09-27.
//
// Rewrites every widget import that points into src/lib/drawing so it resolves
// from the two engine packages:
//
//   framework-free symbols  -> @vninvestcharts/engine-drawing
//   React symbols           -> @vninvestcharts/engine-react
//
// Handles relative and alias specifiers, `import type`, renamed imports and
// multi-line statements. Default imports, namespace imports, require() and
// dynamic import() are reported, never rewritten.
//
// Usage:
//   node scripts/maintenance/migrate-drawing-to-engine.mjs --dry-run
//   node scripts/maintenance/migrate-drawing-to-engine.mjs
//
// Exit: 0 clean, 1 when something could not be migrated.

import fs from "node:fs"
import path from "node:path"
import process from "node:process"

const rootDir = path.resolve(import.meta.dirname, "..", "..")
const drawingDir = path.join(rootDir, "src", "lib", "drawing")
const engineRoot = path.resolve(rootDir, "..", process.argv.find((a) => a.startsWith("--engine="))?.slice(9) ?? "vninvestcharts-engine")
const dryRun = process.argv.includes("--dry-run")

const PKG_DRAWING = "@vninvestcharts/engine-drawing"
const PKG_REACT = "@vninvestcharts/engine-react"

// ── export surfaces ────────────────────────────────────────────────────────
function readFileSafe(p) {
	try {
		return fs.readFileSync(p, "utf8")
	} catch {
		return null
	}
}

function collectExports(file) {
	const src = readFileSafe(file)
	if (src === null) return new Set()
	const names = new Set()
	for (const m of src.matchAll(/^export (?:declare )?(?:async )?(?:function|const|class|interface|type|let|enum)\s+([A-Za-z0-9_$]+)/gm)) {
		names.add(m[1])
	}
	// re-exports count towards the public surface, including `export { X } from "..."`
	for (const m of src.matchAll(/^export\s+(?:type\s+)?\{([\s\S]*?)\}/gm)) {
		for (const part of m[1].split(",")) {
			const n = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim()
			if (n && n !== "type") names.add(n)
		}
	}
	return names
}

const pureBarrel = path.join(engineRoot, "packages", "vn-kline-engine-drawing", "src", "index.ts")
const reactBarrel = path.join(engineRoot, "packages", "vn-kline-engine-react", "src", "drawing-ui", "index.ts")
const PURE = collectExports(pureBarrel)
const REACT = collectExports(reactBarrel)

if (PURE.size === 0 || REACT.size === 0) {
	console.error(`cannot read the engine barrels.\n  ${pureBarrel}\n  ${reactBarrel}`)
	console.error("pass --engine=<path-to-vninvestcharts-engine> when working in a worktree")
	process.exit(1)
}

// ── module ownership ───────────────────────────────────────────────────────
const REACT_MODULES = new Set()
for (const name of collectExports(reactBarrel)) void name
const reactSourceDir = path.join(engineRoot, "packages", "vn-kline-engine-react", "src", "drawing-ui")
function walk(dir, out = []) {
	if (!fs.existsSync(dir)) return out
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const next = path.join(dir, entry.name)
		if (entry.isDirectory()) walk(next, out)
		else if (/\.tsx?$/.test(entry.name)) out.push(next)
	}
	return out
}
// a widget drawing module is a React one when engine-react ships a same-named file
for (const p of walk(reactSourceDir)) {
	REACT_MODULES.add(path.basename(p).replace(/\.tsx?$/, ""))
}

function resolveModule(fromDir, spec) {
	const base = path.resolve(fromDir, spec)
	for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
		if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand
	}
	return null
}

function moduleIsReact(modulePath) {
	if (path.basename(modulePath).replace(/\.tsx?$/, "") === "index") return true // barrel: mixed
	return REACT_MODULES.has(path.basename(modulePath).replace(/\.tsx?$/, ""))
}

function targetPackage(symbol, modulePath) {
	const inPure = PURE.has(symbol)
	const inReact = REACT.has(symbol)
	if (inPure && inReact) return moduleIsReact(modulePath) ? PKG_REACT : PKG_DRAWING
	if (inPure) return PKG_DRAWING
	if (inReact) return PKG_REACT
	return null
}

// ── scan the widget ────────────────────────────────────────────────────────
const IMPORT_RE = /^(import|export)\s+(type\s+)?(\{[\s\S]*?\}|\*\s+as\s+[A-Za-z0-9_$]+|[\w$]+)\s*from\s*["']([^"']+)["'];?/gm
const SIDE_EFFECT_RE = /^import\s+["']([^"']+)["'];?/gm
const DYNAMIC_RE = /(?:await\s+import|import)\s*\(\s*["']([^"']+)["']\s*\)/g
const REQUIRE_RE = /require\s*\(\s*["']([^"']+)["']\s*\)/g

const files = []
;(function scan(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === "dist") continue
		const next = path.join(dir, entry.name)
		if (entry.isDirectory()) scan(next)
		else if (/\.(ts|tsx)$/.test(entry.name)) files.push(next)
	}
})(path.join(rootDir, "src"))

const unresolved = []
const manual = []
let touchedFiles = 0
let rewrittenStatements = 0

function pointsAtDrawing(fromDir, spec) {
	if (spec === "@lib/drawing" || spec.startsWith("@lib/drawing/")) return true
	if (!spec.startsWith(".")) return false
	const resolved = resolveModule(fromDir, spec)
	if (resolved === null) return false
	return resolved === drawingDir || resolved.startsWith(drawingDir + path.sep)
}

for (const file of files) {
	if (file.startsWith(drawingDir)) continue // deleted in Phase 5, nothing to migrate
	const dir = path.dirname(file)
	const original = fs.readFileSync(file, "utf8")
	let out = original
	let changed = false

	out = out.replace(IMPORT_RE, (full, kw, typeKw, clause, spec) => {
		if (!pointsAtDrawing(dir, spec)) return full
		if (clause.startsWith("*") || !clause.startsWith("{")) {
			manual.push({ file, reason: "default/namespace import", spec, clause })
			return full
		}
		const modulePath = resolveModule(dir, spec) ?? drawingDir
		const inner = clause.slice(1, -1)
		const byPkg = new Map()
		const missingHere = []
		for (const raw of inner.split(",")) {
			const part = raw.trim()
			if (!part) continue
			const isType = Boolean(typeKw) || part.startsWith("type ")
			const body = part.replace(/^type\s+/, "")
			const [imported, local = imported] = body.split(/\s+as\s+/).map((s) => s.trim())
			const pkg = targetPackage(imported, modulePath)
			if (pkg === null) {
				missingHere.push(imported)
				continue
			}
			if (!byPkg.has(pkg)) byPkg.set(pkg, [])
			byPkg.get(pkg).push({ imported, local, isType })
		}
		if (missingHere.length > 0) {
			// report every missing symbol of this statement, not just the first
			for (const symbol of missingHere) {
				unresolved.push({ file: path.relative(rootDir, file), symbol, spec })
			}
			return full
		}
		const statements = []
		for (const [pkg, syms] of byPkg) {
			// `import type` / `export type` only when the whole clause is types;
			// an import must never become an export or the names leave scope.
			const allTypes = syms.every((s) => s.isType)
			const kwOut = allTypes ? `${kw} type` : kw
			const body2 = syms
				.map((s) => `${!allTypes && s.isType ? "type " : ""}${s.imported}${s.imported === s.local ? "" : ` as ${s.local}`}`)
				.join(", ")
			statements.push(`${kwOut} { ${body2} } from "${pkg}";`)
		}
		rewrittenStatements += 1
		changed = true
		return statements.join("\n")
	})

	// dynamic imports and require(): report only
	for (const m of original.matchAll(DYNAMIC_RE)) {
		if (pointsAtDrawing(dir, m[1])) manual.push({ file, reason: "dynamic import()", spec: m[1] })
	}
	for (const m of original.matchAll(REQUIRE_RE)) {
		if (pointsAtDrawing(dir, m[1])) manual.push({ file, reason: "require()", spec: m[1] })
	}

	if (changed) {
		touchedFiles += 1
		if (!dryRun) fs.writeFileSync(file, out, "utf8")
	}
}

// ── report ──────────────────────────────────────────────────────────────────
console.log(`mode: ${dryRun ? "DRY RUN" : "write"}`)
console.log(`engine: ${engineRoot}`)
console.log(`pure exports: ${PURE.size} | react exports: ${REACT.size} | react modules: ${REACT_MODULES.size}`)
console.log(`files scanned: ${files.length} | files touched: ${touchedFiles} | statements rewritten: ${rewrittenStatements}`)
console.log(`symbols not exported by either package: ${unresolved.length}`)
for (const u of unresolved.slice(0, 40)) console.log(`  MISSING ${u.symbol}  (${u.file} <- ${u.spec})`)
console.log(`statements needing manual handling: ${manual.length}`)
for (const m of manual.slice(0, 40)) console.log(`  MANUAL ${m.reason}: ${path.relative(rootDir, m.file)} <- ${m.spec}`)

process.exit(unresolved.length === 0 ? 0 : 1)
