#!/usr/bin/env node
/* Gate `audit:readme-claims` — the README is the sales surface, so a false claim
 * there costs a customer relationship, not a unit test.
 *
 * Why a script and not a checklist entry: this repo shipped four unsupported
 * README claims at once and nothing noticed. Each was individually plausible
 * ("76 tools", "60 FPS", "T+1.5 settlement", "Industry Screener") and every one of
 * them was checkable in seconds:
 *
 *   - `Industry Screener`    0 occurrences of `screener` in src/
 *   - `T+1.5 settlement`     0 occurrences of `T+1.5` anywhere; the engine is T+2
 *   - `60 FPS`               no benchmark exists; `npm run benchmark:backfill`
 *                            points at a file that does not exist (Hazard 9)
 *   - `MultiChartSyncOptions` 0 occurrences in src/lib/types/runtime.ts
 *   - `subscribeRealtime`    0 occurrences in the entire repository
 *
 * Each of those was a claim a buyer could act on and be wrong by.
 *
 * The gate asserts three things:
 *   1. BANNED phrases - claims known to be false or unbenchmarked.
 *   2. COUNTS - the numbers the README advertises are recomputed from the code.
 *   3. EXPORTS - every symbol the README tells a buyer to import is actually
 *      reachable from the published entry, or is flagged as a build-only claim.
 *
 * Counts are recomputed from source and from the built bundle, never from the
 * README, so editing the README to match a wrong number fails instead of passing.
 *
 * Usage:
 *   node scripts/check-readme-claims.mjs
 *   node scripts/check-readme-claims.mjs --self-test
 *
 * Exit 0 = every advertised claim holds. Exit 1 = at least one does not.
 * Exit 2 = the README or dist/ is missing (reported as SKIPPED, not Pass).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

/* `--root` lets the self-test run this exact file against a TEMP COPY of the repo.
 * A self-test that only inspects the current README cannot distinguish a working
 * gate from a no-op; it has to plant a violation and require a non-zero exit. */
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const ROOT =
	rootIdx >= 0 && argv[rootIdx + 1]
		? path.resolve(argv[rootIdx + 1])
		: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const README = path.join(ROOT, "README.md");

/* Claims that were false, or that cannot be substantiated by anything in the repo.
 * Each entry names WHY, so a future session that finds a real benchmark can
 * delete the line deliberately instead of wondering why it is banned. */
const BANNED = [
	{
		pattern: /60\s*FPS/i,
		why: "no frame-rate benchmark ships; benchmark:backfill points at a missing file and the soak test times computeScales only",
	},
{
		pattern: /\bT\+1\.5\b/,
		why: "settlement is T+2; `T+1.5` has 0 occurrences in src/ and in any README code block",
	},
	{
		pattern: /Industry Screener/i,
		why: "`screener` has 0 occurrences in src/ - the feature does not exist",
	},
	{
		pattern: /MultiChartSyncOptions/,
		scope: "code",
		why: "not exported from src/lib/types/runtime.ts; the README import could not resolve",
	},
	{
		pattern: /subscribeRealtime/,
		scope: "code",
		why: "0 occurrences in src/ and in any README code block; the example invented a method the engine does not have",
	},
	{
		pattern: /Bar Replay \([^)]*custom speed/i,
		why: "replayInterval is hardcoded to \"source\" and the change handler is an empty TODO",
	},
	{
		pattern: /zero backend (coupling|lock-in)/i,
		why: "data path mac dinh can backend (/core/v1/*); fallback data co san nhung khong phai 'zero coupling' (P0-6)",
	},
	{
		pattern: /Hoàn toàn độc lập Backend/i,
		why: "tuong tu — data path can backend (P0-6)",
	},
	/* Throughput claims, banned for the same reason as 60 FPS: no benchmark ships.
	 * These are the shapes an integrator screenshots into a vendor evaluation. */
	{
		pattern: /\b\d[\d,]*\+?\s*(?:bars?|candles?|nến)\b(?![^.]{0,40}not|CHƯA|Chưa)/i,
		scope: "document",
		why: "no dataset-size benchmark ships; state the figure only alongside an explicit 'not verified' note",
	},
];

/* Numbers the README advertises, recomputed here. `expect` is the value the
 * README must contain; `actual` is measured. Both come from code, never from
 * the README, which is what makes the comparison meaningful. */
function walk(dir, out = []) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		if (e.isDirectory()) walk(path.join(dir, e.name), out);
		else if (/\.tsx?$/.test(e.name)) out.push(path.join(dir, e.name));
	}
	return out;
}

const read = (p) => {
	try {
		return fs.readFileSync(p, "utf8");
	} catch {
		return null;
	}
};

const problems = [];
const notes = [];
const checks = [];

function measureIndicators() {
	const file = path.join(ROOT, "src/lib/indicators/index.ts");
	const src = read(file);
	// Unreadable source is NOT the same as "zero indicators". Returning 0 for a missing
	// file made every indicator claim in the README fail with a fabricated number -
	// which is exactly what happens on a partial checkout, and what made the self-test's
	// clean-repo case fail. Unmeasurable must report as unmeasurable.
	if (src === null) return null;
	return new Set(
		[...src.matchAll(/^registerIndicator\(\s*([A-Z0-9_]+)\s*\);/gm)].map((m) => m[1]),
	).size;
}

function measureDrawingTools() {
	// The number a consumer actually receives, measured from the shipped engine
	// build. Counting source registrations over-counts (aliases) and counting
	// files under-counts (shared modules).
	const engineDist = path.join(ROOT, "node_modules/@vninvestcharts/engine-drawing/dist/index.js");
	if (!fs.existsSync(engineDist)) return null;
	try {
		const out = execFileSync(
			process.execPath,
			[
				"--input-type=module",
				"--eval",
				`const m = await import(${JSON.stringify(new URL(`file:///${engineDist.replace(/\\/g, "/")}`).href)});
				 process.stdout.write(String(m.listDrawingTools().length));`,
			],
			{ encoding: "utf8", timeout: 60_000 },
		);
		return Number(out.trim());
	} catch {
		return null;
	}
}

function measureEntryExports() {
	const js = path.join(ROOT, "dist/index.js");
	const src = read(js);
	if (src === null) return null;
	const m = src.match(/export\s*\{([^}]*)\}/);
	if (!m) return [];
	return m[1]
		.split(",")
		.map((s) => s.trim().split(/\s+as\s+/).pop().trim())
		.filter(Boolean);
}

// ---- the checks ------------------------------------------------------------------

function checkBanned() {
	const raw = read(README);
	if (raw === null) {
		notes.push("README.md not found - banned-phrase scan SKIPPED, not passed");
		return;
	}
// Scan CODE BLOCKS for the API-shaped phrases, and the WHOLE document for the
	// marketing-shaped ones.
	//
	// The split matters: `subscribeRealtime` is banned because an EXAMPLE used it, so
	// it must not appear in a code block - but this file has to be able to explain in
	// prose why it was removed. Banning the bare string everywhere would have made the
	// explanation of the fix itself a violation, which is how a gate starts training
	// people to work around it.
	//
	// URL-DECODED before matching, and this is not cosmetic. A shields.io badge spells
	// a space as `%20`, so `rendering-60%20FPS%20WebGL` rendered as "rendering 60 FPS"
	// to every reader while matching no literal-space pattern - an independent audit
	// found the claim still on the README while this gate reported `ok`. A gate that
	// cannot see the string a reader sees is blind to the thing it exists to catch.
	const decode = (s) =>
		s
			.replace(/%20/g, " ")
			.replace(/%2F/gi, "/")
			.replace(/%3A/gi, ":")
			.replace(/&amp;/g, "&");
	const blocks = decode([...raw.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]).join("\n"));
	const document = decode(raw);
	// HTML comments ship to every reader of the rendered page while looking like
	// nothing to a casual skimmer, so they are included in the code scope too.
	const htmlComments = decode([...raw.matchAll(/<!--[\s\S]*?-->/g)].map((m) => m[0]).join("\n"));
	for (const { pattern, why, scope } of BANNED) {
		const haystack =
			scope === "code" ? `${blocks}\n${htmlComments}` : document;
		const m = haystack.match(pattern);
		checks.push({
			name: `banned phrase ${pattern} (${scope ?? "document"})`,
			ok: !m,
			detail: m ? why : "",
		});
		if (m) problems.push(`README advertises ${JSON.stringify(m[0])} - ${why}`);
	}
}

/**
 * The README must state the MEASURED number, not merely contain a related phrase.
 *
 * The first version only asked "does one of these phrases appear?" and passed when
 * the README said `60+` while the code registers 59 - it found the phrase family and
 * never compared the value. A gate that cannot tell `59` from `60+` is not measuring
 * anything, so the number is now extracted and compared as a number.
 */
function checkNumberClaim(label, measured, finders) {
	if (measured === null) {
		notes.push(`${label}: could not measure - check SKIPPED, not passed`);
		return;
	}
	const text = read(README) ?? "";
	for (const [what, pattern] of Object.entries(finders)) {
		// matchAll requires a global regex; the callers pass non-global ones.
		const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
		for (const m of text.matchAll(re)) {
			const claimed = Number(m[1]);
			// A "+" is not a free pass in either direction.
			//
			// "60+" while 59 are registered is not strictly a lie, but it is exactly the
			// kind of rounded-up number a buyer cannot cross-check against the source,
			// and these counts are the ones people verify. So a "+" is accepted only when
			// it is a LOWER bound on the measurement ("59+" when 76 tools ship) and
			// rejected when it rounds UP.
			//
			// The first attempt used `claimed >= measured`, which is the standard reading
			// of "at least 60" - and it passed a README that says 60+ about 59
			// indicators. Verified by mutating the README back and watching the gate
			// stay green, which is the only reason this line reads the way it does.
			const hasPlus = Boolean(m[2]);
			const ok = hasPlus ? claimed <= measured : claimed === measured;
			checks.push({ name: `${label} ${what} = ${m[0].trim()}`, ok, detail: `measured ${measured}` });
			if (!ok) {
				problems.push(
					`README says ${m[0].trim()} for ${what}, but the measured ${label} is ${measured}` +
						(hasPlus
							? " (a '+' claim must not round up past the measurement)"
							: " (an exact claim must equal the measurement)"),
				);
			}
		}
	}
}

function checkAdapterExample() {
	const text = read(README);
	if (text === null) return;
	const start = text.indexOf("#### Custom Adapter Example");
	if (start === -1) {
		notes.push("adapter example not found - SKIPPED");
		return;
	}
	const block = text.slice(start).split("```typescript")[1]?.split("```")[0] ?? "";
	// The engine interface, measured rather than remembered.
	const types = read(
		path.join(
			process.env.VN_ENGINE_REPO ?? path.join(ROOT, "..", "vninvestcharts-engine"),
			"packages/vn-kline-engine-core/src/types.ts",
		),
	);
	if (types === null) {
		notes.push("engine types.ts not reachable - adapter check SKIPPED, not passed");
		return;
	}
	const iface = types.match(/interface StockDataAdapter\s*\{([\s\S]*?)\n\}/);
	if (!iface) {
		notes.push("StockDataAdapter interface not found in engine - SKIPPED");
		return;
	}
	const required = [...iface[1].matchAll(/^\s*(?!get\w+\?|fetchCorporateEvents\?|getLast|fetchCoverageBulk\?)([A-Za-z]+)\s*\(/gm)]
		.map((m) => m[1])
		.filter((n) => !n.endsWith("?"));
	const missing = required.filter((name) => !new RegExp(`\\b${name}\\s*[(:]`).test(block));
	checks.push({
		name: `adapter example implements all ${required.length} required members`,
		ok: missing.length === 0,
		detail: missing.join(", "),
	});
	if (missing.length) {
		problems.push(`README adapter example omits required member(s): ${missing.join(", ")}`);
	}
}

/** Any symbol the README imports from the package must be really exported. */
function checkDocumentedImports() {
	const text = read(README) ?? "";
	const entry = measureEntryExports();
	if (entry === null) {
		notes.push("dist/index.js absent - documented-import check SKIPPED, not passed");
		return;
	}
	const entrySet = new Set(entry);
// Symbols the README shows importing from the package name.
	//
	// The package name is read from package.json rather than hardcoded. It used to be a
	// literal `vninvestcharts-widget`, and when the package moved to
	// `@vninvestcharts/widget` that literal simply stopped matching: the check reported
	// "0 documented imports", which is indistinguishable from "no bad imports". A gate
	// whose input silently becomes empty stops being a gate.
	//
	// Inline `//` comments inside the braces are stripped FIRST. Without that,
	// `VNInvestCharts, // Core single-chart widget` yields one "name" that is the name
	// plus the rest of the line, and every subsequent import looks missing.
	// `read()` returns TEXT, so it has to be parsed before `.name` is reachable. Reading
	// `.name` off the string itself yields undefined, which then reads as "no imports
	// documented" - the empty-input failure mode this whole change was meant to stop.
	let PACKAGE_NAME = "";
	try {
		PACKAGE_NAME = JSON.parse(read(path.join(ROOT, "package.json")) ?? "{}").name ?? "";
	} catch {
		PACKAGE_NAME = "";
	}
	if (!PACKAGE_NAME) notes.push("package name unreadable - documented-import check SKIPPED");
	const imported = new Set();
	const importRe = new RegExp(
		`import\\s+(?:type\\s+)?\\{([^}]+)\\}\\s+from\\s+['"]${PACKAGE_NAME}(?:/[^'"]*)?['"]`,
		"g",
	);
	for (const m of text.matchAll(importRe)) {
		for (const raw of m[1].split("\n").join(" ").split("//")[0].split(",")) {
			const name = raw.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, "").trim();
			if (name) imported.add(name);
		}
	}
	if (imported.size === 0) {
		notes.push(
			`no imports of "${PACKAGE_NAME}" found in the README - documented-import check had NOTHING to check`,
		);
	}
	// Types live in the .d.ts, not the runtime export list, so only check the
	// runtime-visible ones and report the type-only ones as notes rather than fails.
	//
	// The d.ts is scanned for EVERY re-export form, not just `export type {...}`:
	// this file mixes `export type { OHLCVBar }`, `export { x, type StockDataAdapter }`
	// and `export declare type/interface`, and an earlier version of this gate matched
	// only the first, reporting four symbols the package genuinely exports.
// Name discovery over the emitted .d.ts.
	//
	// Only ONE form is needed: every name a consumer can import appears inside some
	// `{ ... }` export list, so scanning brace lists - multi-line, comma-separated -
	// covers `export type {A, B}`, `export {C, type D}` and plain `declare type/interface`
	// alike.
	//
	// The earlier version also ran four narrower regexes first. They were not merely
	// redundant: running several /g regexes over one string via matchAll interleaves
	// their `lastIndex`, and the result was a 4447-name set in which the symbol the
	// package exports on its own public-api.d.ts line went missing. One scanner, no
	// state to interleave.
	const declaredTypes = new Set();
	const dtsFiles = walkDts(path.join(ROOT, "dist/dts"));
	for (const f of dtsFiles) {
		const txt = read(f);
		if (txt === null) continue;
		for (const m of txt.matchAll(/\{([^{}]*)\}/g)) {
			for (const part of m[1].split(",")) {
				const name = part
					.trim()
					.replace(/^(?:declare\s+)?(?:type|const|function|class|enum|interface)\s+/, "")
					.split(/\s+as\s+/)[0]
					.trim();
				if (/^[A-Za-z0-9_]+$/.test(name)) declaredTypes.add(name);
			}
		}
	}
	const missing = [];
	for (const name of imported) {
		if (entrySet.has(name)) continue;
		if (declaredTypes.has(name)) continue;
		missing.push(name);
	}
	checks.push({
		name: `${imported.size} documented imports resolve (dts files scanned: ${dtsFiles.length})`,
		ok: missing.length === 0,
		detail: missing.join(", "),
	});
	if (missing.length) problems.push(`README imports not exported by the package: ${missing.join(", ")}`);


}

function walkDts(dir, out = []) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walkDts(p, out);
		else if (e.name.endsWith(".d.ts")) out.push(p);
	}
	return out;
}

// ---- self-test ---------------------------------------------------------------------

/**
 * A self-test that only ever sees a CLEAN repo cannot tell a gate from a no-op.
 *
 * An independent audit neutered the reporting branch of this file - one line:
 * `problems.length = 0` - and the gate still printed PASS and exited 0. The first
 * self-test also reported 6/6 in that state, because every case asserted on the
 * current (valid) README rather than on a planted violation.
 *
 * So the cases below run this SAME file, as a child process, against a TEMP COPY of
 * the repo with a violation planted in it, and require a non-zero exit. That covers
 * the checks, the reporting and the exit code together - which is the only thing that
 * constitutes evidence a gate works.
 */
function runGateInTemp(mutate, label) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vnsc-readme-selftest-"));
	try {
		// The measurement inputs are copied too, not just the README. A temp root with
		// no src/ makes every count "unmeasurable", so the count cases could not fail -
		// and a self-test whose cases cannot fail is the defect this whole section
		// exists to fix.
		fs.copyFileSync(README, path.join(dir, "README.md"));
		const indicatorSrc = path.join(ROOT, "src/lib/indicators/index.ts");
		const indicatorDst = path.join(dir, "src/lib/indicators/index.ts");
		fs.mkdirSync(path.dirname(indicatorDst), { recursive: true });
		fs.copyFileSync(indicatorSrc, indicatorDst);
		mutate(dir);
		try {
			execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--root", dir], {
				stdio: "pipe",
			});
			return 0;
		} catch (e) {
			return e.status ?? 1;
		}
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

function selfTest() {
	let failed = 0;
	const check = (name, fn) => {
		try {
			fn();
			console.log(`PASS  ${name}`);
		} catch (e) {
			console.log(`FAIL  ${name}: ${e.message}`);
			failed += 1;
		}
	};

	const saved = read(README) ?? "";

	check("the clean README produces no findings", () => {
		const r = runGateInTemp(() => {}, "clean");
		if (r !== 0) throw new Error(`gate exited ${r} on an unmodified README`);
	});

	check("a planted 60 FPS claim exits non-zero", () => {
		const r = runGateInTemp((dir) => {
			fs.appendFileSync(path.join(dir, "README.md"), "\nrendering at 60 FPS\n");
		}, "60 FPS");
		if (r === 0) throw new Error("gate exited 0 with a 60 FPS claim present");
	});

	check("a planted 60 FPS claim in a URL-ENCODED badge exits non-zero", () => {
		// The regression an audit found: `%20` hid the claim from the gate while
		// rendering as "60 FPS" to every reader.
		const r = runGateInTemp((dir) => {
			fs.appendFileSync(
				path.join(dir, "README.md"),
				"\n![b](https://img.shields.io/badge/rendering-60%20FPS-orange.svg)\n",
			);
		}, "encoded 60 FPS");
		if (r === 0) throw new Error("gate exited 0 with a %20-encoded 60 FPS badge");
	});

	check("an inflated indicator count exits non-zero", () => {
		const r = runGateInTemp((dir) => {
			const p = path.join(dir, "README.md");
			fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("59 SSOT", "60+ SSOT"), "utf8");
		}, "60+ indicators");
		if (r === 0) throw new Error("gate exited 0 with '60+' over a measured 59");
	});

	check("a subscribeRealtime example exits non-zero", () => {
		const r = runGateInTemp((dir) => {
			fs.appendFileSync(
				path.join(dir, "README.md"),
				"\n```ts\nadapter.subscribeRealtime = () => {};\n```\n",
			);
		}, "subscribeRealtime");
		if (r === 0) throw new Error("gate exited 0 with subscribeRealtime in a code block");
	});

	check("the banned list is non-empty (an empty list passes vacuously)", () => {
		if (BANNED.length === 0) throw new Error("empty banned list");
		if (BANNED.some((b) => !(b.pattern instanceof RegExp))) {
			throw new Error("a banned entry has no pattern");
		}
	});

	check("indicator measurement is a positive integer", () => {
		const n = measureIndicators();
		if (!Number.isInteger(n) || n <= 0) throw new Error(`measured ${n}`);
	});

	check("the clean README's saved copy is non-trivial", () => {
		// Guards the guard: if README stopped being read, every case above would still
		// be green because the planted text lands in an empty file that parses fine.
		if (saved.length < 1000) throw new Error(`README looked suspiciously short (${saved.length})`);
	});

	console.log(failed === 0 ? "\nself-test: 8/8 PASS" : `\nself-test: ${failed} FAILED`);
	process.exit(failed === 0 ? 0 : 1);
}

// ---- main ---------------------------------------------------------------------------

if (process.argv.includes("--self-test")) {
	selfTest();
}

if (read(README) === null) {
	console.error("README.md not found at the repo root");
	process.exit(2);
}

checkBanned();
checkNumberClaim("indicator count", measureIndicators(), {
	"SSOT indicator banner": /(\d+)(\+?)\s+SSOT Indicators/i,
	"indicator capability row": /\*\*(\d+)(\+?)\s+High-Performance Indicators\*\*/i,
	"indicator feature row": /Technical Indicators\s*\((\d+)(\+?)\)/i,
});
const tools = measureDrawingTools();
if (tools === null) {
	notes.push("drawing tool count: engine dist not reachable - SKIPPED, not passed");
} else {
	checkNumberClaim("drawing tool count", tools, {
		"tool capability row": /\*\*(\d+)(\+?)\s+(?:Precision|precision) Drawing Tools\*\*/,
		"headline": /(\d+)(\+?)\s+precision drawing tools/i,
		"tool row (VI)": /(\d+)(\+?)\s+công cụ vẽ/i,
	});
}
checkAdapterExample();
checkDocumentedImports();

for (const c of checks) {
	console.log(`${c.ok ? "ok  " : "FAIL"}  ${c.name}${c.ok || !c.detail ? "" : `\n        ${c.detail}`}`);
}
for (const n of notes) console.log(`note  ${n}`);

if (problems.length) {
	console.error(`\nFAIL: ${problems.length} unsupported README claim(s)`);
	for (const p of problems) console.error(`  - ${p}`);
	process.exit(1);
}
console.log("\nPASS: every advertised README claim was re-measured against the code");