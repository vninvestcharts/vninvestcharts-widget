#!/usr/bin/env node
/**
 * audit-raw-color - đo bao nhiêu mã màu THÔ nằm ngoài namespace token.
 *
 * WHY THIS EXISTS
 * P0-7 của `PLAN_P0_REMEASURE_AND_NEXT_STEP_2026-10-22.md`: sản phẩm có **hai hệ
 * màu** (`--vnsc-*` và `--rsc-*`/`--gc-*`) cộng hàng nghìn hex viết thẳng trong
 * component ⇒ đổi theme không repaint hết UI, và không có cách nào biết mình đã
 * sạch tới đâu.
 *
 * Nguyên tắc thiết kế (design rule D2 của `PLAN_MASTER_ROADMAP_2026-10-22.md` §6.1):
 * **0 hex thô ngoài token**. Token SSOT là `src/widget/styles/tokens/` — đó là nơi
 * hex ĐƯỢC phép tồn tại.
 *
 * Script này là **phép đo**, chưa phải cổng: nó in ra số đo và ghi JSON để so
 * sánh được giữa các lần chạy. Khi số đau đi về 0 thì mới bật `--strict` để nó
 * thành cổng chặn (L-G01: mỗi cổng mới phải có self-test âm tính + in cả số
 * đã quét lẫn số đã phán xét).
 *
 * EXIT CODES
 *   0  đo xong (và nếu `--strict`: số hex thô ≤ baseline)
 *   1  `--strict` và số hex thô > baseline
 *   2  không quét được (thiếu thư mục nguồn)
 *
 * Usage:
 *   node scripts/audit-raw-color.mjs                 # đo + ghi JSON evidence
 *   node scripts/audit-raw-color.mjs --strict        # cổng: fail khi vượt baseline
 *   node scripts/audit-raw-color.mjs --self-test     # self-test âm tính
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
/** Token SSOT: nơi duy nhất hex được phép tồn tại. */
const TOKEN_DIR = path.join(ROOT, "src/widget/styles/tokens");
const OUT_FILE = path.join(ROOT, "docs/evidence/RAW_COLOR_AUDIT.json");
/**
 * Baseline để `--strict` so sánh.
 * ĐO 2026-10-22 trên `952b2932`: **2.212 hex thô / 185 file** (đã loại `injected.css`
 * là artifact sinh tự động; và bỏ hex trong comment, hex sai độ dài).
 * ⇒ đây là mốc để đo **giảm dần**, không phải ngưỡng đạt được ngay.
 */
const BASELINE = 2212;

const EXT = [".ts", ".tsx", ".css", ".scss"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", "__snapshots__"]);

/**
 * File **sinh tự động** (gitignored) ⇒ không được đếm: `injected.css` là CSS đã gộp
 * của toàn bộ `src/widget/styles/*.css` (do `build-css-modules-v2.js` tạo) ⇒ đếm nó
 * là **đếm 2 lần** mọi hex đã đo ở file nguồn. Số đo đúng phải chỉ nhìn **file nguồn**.
 */
const GENERATED = new Set(["src/widget/styles/injected.css"]);

/**
 * Hex 3/4/6/8 chữ số. Cần tránh bắt nhầm: `#` trong comment/URL/id không phải màu.
 * ⇒ chỉ nhận khi **đứng ngay trước** một chữ số hex hợp lệ và không nằm trong
 * `http(s)://…#anchor`.
 */
const HEX_RE = /#([0-9a-fA-F]{3,8})\b/g;

/** Bỏ qua comment (dong `//` va khoi `slash-star`) de khong dem hex trong chu thich. */
function stripComments(text) {
	return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Vùng nào được miễn: file token SSOT. */
function isTokenFile(rel) {
	return rel.startsWith("src/widget/styles/tokens/");
}

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

/** Quét 1 file ⇒ { count, values:Set<string> } */
function scanFile(abs) {
	const text = stripComments(fs.readFileSync(abs, "utf8"));
	const values = new Set();
	let count = 0;
	HEX_RE.lastIndex = 0;
	let m;
	while ((m = HEX_RE.exec(text)) !== null) {
		const hex = m[1];
		// 3/4/6/8 chữ số hex hợp lệ; 5/7 chữ số không phải màu CSS ⇒ bỏ.
		if (![3, 4, 6, 8].includes(hex.length)) continue;
		// Đứng trước mà phải là ranh giới hợp lệ (không phải phần của identifier).
		const before = text[m.index - 1];
		if (before && /[A-Za-z0-9_-]/.test(before)) continue;
		count += 1;
		values.add(hex.toLowerCase());
	}
	return { count, values };
}

function audit() {
	if (!fs.existsSync(SRC)) {
		console.error("audit-raw-color: FAILED - khong thay src/");
		process.exit(2);
	}
	const files = [];
	for (const f of walk(SRC)) files.push(f);

	const perFile = [];
	const allValues = new Set();
	let total = 0;
	let tokenTotal = 0;
	let scannedFiles = 0;

	for (const f of files) {
		const rel = path.relative(ROOT, f).replace(/\\/g, "/");
		if (GENERATED.has(rel)) continue;
		const { count, values } = scanFile(f);
		scannedFiles += 1;
		if (isTokenFile(rel)) {
			tokenTotal += count;
			continue;
		}
		if (count === 0) continue;
		total += count;
		for (const v of values) allValues.add(v);
		perFile.push({ file: rel, hex: count });
	}
	perFile.sort((a, b) => b.hex - a.hex || a.file.localeCompare(b.file));

	return {
		generatedAt: new Date().toISOString(),
		scannedFiles,
		filesWithRawHex: perFile.length,
		rawHexTotal: total,
		distinctRawHexValues: allValues.size,
		tokenHexTotal: tokenTotal,
		baseline: BASELINE,
		top: perFile.slice(0, 25),
		perFile,
	};
}

function selfTest() {
	// Âm tính: file sạch ⇒ 0; file có hex trong comment ⇒ KHÔNG đếm; hex sai độ dài ⇒
	// không đếm; file trong tokens/ ⇒ miễn.
	const cases = [
		{ name: "khong co hex", text: "color: var(--vnsc-accent);", expect: 0 },
		{ name: "hex 6 chu so", text: "color: #1a2b3c;", expect: 1 },
		{ name: "hex 3 chu so", text: "color: #fff;", expect: 1 },
		{ name: "hex trong comment //", text: "// mau #1a2b3c\ncolor: red;", expect: 0 },
		{ name: "hex trong comment khoi", text: "/* mau #1a2b3c */ color: red;", expect: 0 },
		{ name: "do dai sai (5 chu so)", text: "color: #1a2b3;", expect: 0 },
		{ name: "hex sau identifier", text: "x#1a2b3c", expect: 0 },
		{ name: "hai hex", text: "a:#111111;b:#222222;", expect: 2 },
	];
	let failed = 0;
	for (const c of cases) {
		const { count } = scanFileFromText(c.text);
		const ok = count === c.expect;
		if (!ok) failed += 1;
		console.log(`  ${ok ? "ok  " : "FAIL"} ${c.name} (expect ${c.expect}, got ${count})`);
	}
	// File trong tokens/ phải được miễn.
	const tokenRel = "src/widget/styles/tokens/colors.css";
	const exempt = isTokenFile(tokenRel);
	console.log(`  ${exempt ? "ok  " : "FAIL"} file token duoc mien (${tokenRel})`);
	if (!exempt) failed += 1;
	console.log(failed === 0 ? "self-test PASS" : `self-test FAIL (${failed})`);
	process.exit(failed === 0 ? 0 : 1);
}

/** Bản quét từ chuỗi (dùng cho self-test). */
function scanFileFromText(text) {
	const stripped = stripComments(text);
	const values = new Set();
	let count = 0;
	HEX_RE.lastIndex = 0;
	let m;
	while ((m = HEX_RE.exec(stripped)) !== null) {
		const hex = m[1];
		if (![3, 4, 6, 8].includes(hex.length)) continue;
		const before = stripped[m.index - 1];
		if (before && /[A-Za-z0-9_-]/.test(before)) continue;
		count += 1;
		values.add(hex.toLowerCase());
	}
	return { count, values };
}

if (process.argv.includes("--self-test")) {
	selfTest();
} else {
	const report = audit();
	const strict = process.argv.includes("--strict");
	console.log("== audit-raw-color ==");
	console.log(`  file quét: ${report.scannedFiles}`);
	console.log(`  file có hex thô (ngoài tokens/): ${report.filesWithRawHex}`);
	console.log(`  TỔNG hex thô: ${report.rawHexTotal}  (baseline ${report.baseline})`);
	console.log(`  giá trị hex phân biệt: ${report.distinctRawHexValues}`);
	console.log(`  hex trong tokens/ (được phép): ${report.tokenHexTotal}`);
	console.log("  top 10 file:");
	for (const f of report.top.slice(0, 10)) console.log(`    ${String(f.hex).padStart(4)}  ${f.file}`);

	fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
	fs.writeFileSync(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	console.log(`  ghi: ${path.relative(ROOT, OUT_FILE).replace(/\\/g, "/")}`);

	if (strict && report.rawHexTotal > report.baseline) {
		console.error(`\nFAIL: ${report.rawHexTotal} hex thô > baseline ${report.baseline}`);
		process.exit(1);
	}
	process.exit(0);
}
