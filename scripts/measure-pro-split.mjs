#!/usr/bin/env node
/**
 * measure-pro-split - đo độ lớn và độ coupling của các module Pro, để chốt
 * kế hoạch tách (G1-2 của `PLAN_DEV_PHASE_OFFICIAL_2026-10-22.md`).
 *
 * WHY: G2 (tách Pro vào package private) là việc lớn nhất còn lại, và cái duy nhất
 * chưa có số đo là "nó lớn đến đâu và nó dính vào nhau ra sao". Một kế hoạch tách mà
 * không có số đo là một kế hoạch dựa trên cảm tính. Script này biến nó thành số:
 *   - bao nhiêu file, bao nhiêu dòng (tách prod / test)
 *   - ai import VÀO nhóm (inbound) — càng nhiều inbound, càng phải sửa nhiều chỗ
 *   - nhóm import RA nhóm nào (outbound) — càng nhiều outbound sang nhóm khác, càng
 *     khó tách (phải cắt cả đồ thị, không chỉ di chuyển file)
 *
 * Nó chỉ ĐỌC. Không sửa file nào.
 *
 * Usage:
 *   node scripts/measure-pro-split.mjs            # bảng ra stdout + JSON vào docs/evidence/
 *   node scripts/measure-pro-split.mjs --json     # chỉ JSON ra stdout
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = process.env.VN_ENGINE_REPO
	? path.resolve(process.env.VN_ENGINE_REPO)
	: path.resolve(ROOT, "..", "vninvestcharts-engine");

// ── Nhóm cần đo ────────────────────────────────────────────────────────────────
//
// `roots` là đường dẫn tương đối tới `ROOT` (widget) hoặc tới `ENGINE` (engine).
// `repo` cho biết nhóm nằm ở repo nào — cần thiết vì rule Rule 12: sửa engine phải
// đi qua đủ 5 bước của Rule 13, còn sửa widget thì không.
//
// `note` ghi lý do nhóm này được coi là Pro, để người đọc báo cáo không phải suy.
const GROUPS = [
	{
		id: "pinescript",
		label: "Pine Script compiler + strategy tester",
		repo: "widget",
		roots: ["src/lib/pinescript"],
		note: "đã publish chưa minify trong widget@0.3.0 (Peggy x45, grammar x120, ta.sma x19, strategy.entry x24)",
	},
	{
		id: "replay",
		label: "Bar replay engine + paper trading replay",
		repo: "widget",
		roots: ["src/lib/core/replay"],
		note: "replay x65 trong widget@0.3.0",
	},
	{
		id: "footprint-profile",
		label: "Footprint / VolumeProfile / DeltaProfile / MarketProfile math",
		repo: "widget",
		roots: [
			"src/lib/indicators/utils.ts",
			"src/lib/indicators/builtin/footprint.ts",
			"src/lib/core/calculators/computeProfile.ts",
		],
		note: "footprint x20, marketProfile x18, deltaProfile x18, volumeProfile x28 trong widget@0.3.0",
	},
	{
		id: "pattern-detector",
		label: "Auto pattern detection (engine)",
		repo: "engine",
		roots: ["packages/vn-kline-engine-core/src/patterns"],
		note: "đã publish trong engine-core@1.5.0 (detectChartPatterns là export public)",
	},
	{
		id: "tier16-drawing",
		label: "16 tool vẽ TIER-16 (engine)",
		repo: "engine",
		roots: [
			"packages/vn-kline-engine-drawing/src/builtin/gannAdvanced.ts",
			"packages/vn-kline-engine-drawing/src/builtin/schiffPitchfork.ts",
			"packages/vn-kline-engine-drawing/src/builtin/harmonicPatterns.ts",
			"packages/vn-kline-engine-drawing/src/builtin/harmonicRatioValidation.ts",
			"packages/vn-kline-engine-drawing/src/builtin/elliottWaves.ts",
			"packages/vn-kline-engine-drawing/src/builtin/fibArc.ts",
			"packages/vn-kline-engine-drawing/src/builtin/fibExtended.ts",
		],
		note: "đã publish chưa minify trong engine-drawing@2.2.0 (const phi = 1.6180339887)",
	},
];

const EXT = [".ts", ".tsx"];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", "__snapshots__"]);

function* walk(dir) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const e of entries) {
		if (e.isDirectory()) {
			if (SKIP_DIRS.has(e.name)) continue;
			yield* walk(path.join(dir, e.name));
		} else if (EXT.includes(path.extname(e.name))) {
			yield path.join(dir, e.name);
		}
	}
}

/** Số dòng code thực (bỏ comment + dòng trống) — cùng tiêu chí với fat-file budget. */
function codeLines(text) {
	let n = 0;
	let inBlock = false;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		if (inBlock) {
			if (line.includes("*/")) inBlock = false;
			continue;
		}
		if (line.startsWith("//")) continue;
		if (line.startsWith("/*")) {
			if (!line.includes("*/")) inBlock = true;
			continue;
		}
		n++;
	}
	return n;
}

const IMPORT_RE = /(?:^|\s)(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g;
const DYNAMIC_RE = /import\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(file) {
	const text = fs.readFileSync(file, "utf8");
	const specs = [];
	for (const re of [IMPORT_RE, DYNAMIC_RE]) {
		re.lastIndex = 0;
		let m;
		while ((m = re.exec(text)) !== null) specs.push(m[1]);
	}
	return specs;
}

/** Resolve một specifier tương đối tới file thật (nhiều phần mở rộng). */
function resolveRelative(fromFile, spec) {
	if (!spec.startsWith(".")) return null;
	const base = path.resolve(path.dirname(fromFile), spec);
	for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
		if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
	}
	return null;
}

function isTest(file) {
	return /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || file.includes(`${path.sep}__tests__${path.sep}`);
}

// ── Thu thập ──────────────────────────────────────────────────────────────────

/** File nguồn của mọi repo trong phạm vi: widget `src/` + engine `packages` (mỗi package có `src`). */
function allSourceFiles() {
	const files = [];
	for (const f of walk(path.join(ROOT, "src"))) files.push(f);
	for (const pkg of ["vn-kline-engine-core", "vn-kline-engine-drawing", "vn-kline-engine-react"]) {
		for (const f of walk(path.join(ENGINE, "packages", pkg, "src"))) files.push(f);
	}
	return files;
}

function groupFiles(group) {
	const base = group.repo === "engine" ? ENGINE : ROOT;
	const out = [];
	for (const root of group.roots) {
		const abs = path.join(base, root);
		if (!fs.existsSync(abs)) continue;
		if (fs.statSync(abs).isDirectory()) {
			for (const f of walk(abs)) out.push(f);
		} else {
			out.push(abs);
		}
	}
	return [...new Set(out)];
}

function measure(group, allFiles) {
	const files = groupFiles(group);
	const set = new Set(files.map((f) => path.resolve(f)));
	const prodFiles = files.filter((f) => !isTest(f));
	const testFiles = files.filter((f) => isTest(f));
	const prodLoc = prodFiles.reduce((a, f) => a + codeLines(fs.readFileSync(f, "utf8")), 0);
	const testLoc = testFiles.reduce((a, f) => a + codeLines(fs.readFileSync(f, "utf8")), 0);

	const inbound = new Map(); // file -> Set<importer>
	const outbound = new Map(); // file -> Set<dep file>
	for (const f of allFiles) {
		for (const spec of importsOf(f)) {
			const dep = resolveRelative(f, spec);
			if (!dep) continue;
			const depAbs = path.resolve(dep);
			if (set.has(depAbs)) {
				if (!inbound.has(depAbs)) inbound.set(depAbs, new Set());
				inbound.get(depAbs).add(path.resolve(f));
			} else if (set.has(path.resolve(f))) {
				if (!outbound.has(path.resolve(f))) outbound.set(path.resolve(f), new Set());
				outbound.get(path.resolve(f)).add(depAbs);
			}
		}
	}

	const inboundExternal = new Set(); // importer KHÔNG thuộc nhóm
	for (const [, importers] of inbound) {
		for (const imp of importers) if (!set.has(imp)) inboundExternal.add(imp);
	}
	const outboundExternal = new Set(); // dep KHÔNG thuộc nhóm
	for (const [, deps] of outbound) {
		for (const d of deps) if (!set.has(d)) outboundExternal.add(d);
	}

	const rel = (f) => path.relative(ROOT, f).replace(/\\/g, "/");
	const relEngine = (f) => path.relative(ENGINE, f).replace(/\\/g, "/");
	const label = (f) => (f.startsWith(path.resolve(ENGINE)) ? `engine:${relEngine(f)}` : rel(f));

	return {
		id: group.id,
		label: group.label,
		repo: group.repo,
		note: group.note,
		roots: group.roots,
		files: prodFiles.length + testFiles.length,
		prodFiles: prodFiles.length,
		testFiles: testFiles.length,
		prodLoc,
		testLoc,
		inboundExternal: [...inboundExternal].map(label).sort(),
		outboundExternal: [...outboundExternal].map(label).sort(),
	};
}

const allFiles = allSourceFiles();
const results = GROUPS.map((g) => measure(g, allFiles));

// ── Báo cáo ───────────────────────────────────────────────────────────────────

const OUT_DIR = path.join(ROOT, "docs", "evidence");
const OUT_FILE = path.join(OUT_DIR, "PRO_SPLIT_MEASUREMENT.json");

const pad = (s, n) => String(s).padEnd(n);
const num = (n) => String(n).padStart(6);

const totals = results.reduce(
	(a, r) => ({
		files: a.files + r.files,
		prodLoc: a.prodLoc + r.prodLoc,
		testLoc: a.testLoc + r.testLoc,
		inbound: a.inbound + r.inboundExternal.length,
		outbound: a.outbound + r.outboundExternal.length,
	}),
	{ files: 0, prodLoc: 0, testLoc: 0, inbound: 0, outbound: 0 },
);

const report = {
	generatedAt: new Date().toISOString(),
	engineRepo: path.relative(ROOT, ENGINE).replace(/\\/g, "/"),
	note:
		"Đo bằng `node scripts/measure-pro-split.mjs`. Số dòng là dòng code thực (bỏ comment + dòng trống), " +
		"tách prod / test. `inbound` = file NGOÀI nhóm import vào nhóm (mỗi file đếm 1 lần); " +
		"`outbound` = phụ thuộc ra ngoài nhóm. Đây là số đo để chốt kế hoạch tách (G1-2), không phải cam kết.",
	groups: results,
	totals,
};

if (!process.argv.includes("--json")) {
	console.log("== measure-pro-split ==");
	console.log(`engine repo: ${report.engineRepo}`);
	console.log("");
	console.log(
		`${pad("nhóm", 22)}${pad("repo", 8)}${num("file")}${num("prodLOC")}${num("testLOC")}${num("in")}${num("out")}  nhãn`,
	);
	for (const r of results) {
		console.log(
			`${pad(r.id, 22)}${pad(r.repo, 8)}${num(r.files)}${num(r.prodLoc)}${num(r.testLoc)}${num(r.inboundExternal.length)}${num(r.outboundExternal.length)}  ${r.label}`,
		);
	}
	console.log(
		`${pad("TỔNG", 22)}${pad("", 8)}${num(totals.files)}${num(totals.prodLoc)}${num(totals.testLoc)}${num(totals.inbound)}${num(totals.outbound)}`,
	);
	console.log("");
	for (const r of results) {
		console.log(`--- ${r.id} (${r.repo}) — ${r.label}`);
		console.log(`    note: ${r.note}`);
		if (r.inboundExternal.length) {
			console.log(`    inbound (${r.inboundExternal.length}):`);
			for (const f of r.inboundExternal) console.log(`      <- ${f}`);
		} else {
			console.log("    inbound: 0 — nhóm không bị gì import từ ngoài");
		}
		if (r.outboundExternal.length) {
			console.log(`    outbound (${r.outboundExternal.length}):`);
			for (const f of r.outboundExternal) console.log(`      -> ${f}`);
		} else {
			console.log("    outbound: 0 — nhóm tự chứa, tách đi được ngay");
		}
		console.log("");
	}
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (!process.argv.includes("--json")) console.log(`ghi: ${path.relative(ROOT, OUT_FILE).replace(/\\/g, "/")}`);
