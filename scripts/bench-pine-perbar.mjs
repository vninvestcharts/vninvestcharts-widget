#!/usr/bin/env node
/**
 * bench-pine-perbar.mjs — ĐO chi phí thực thi per-bar của evaluator VnScript.
 *
 * VÌ SAO FILE NÀY TỒN TẠI: plan `PLAN_PINE_STAGE3_2026-10-09.md` §6 R-01 cảnh báo
 * per-bar thành O(n²), nhưng bản plan đầu ghi 4 con số (6.0 / 27.6 / 18.4 / 96.8 ms)
 * mà **không script nào tái tạo được**, và chúng **không đơn điệu** (N=500 chậm hơn
 * N=1000) ⇒ đó là nhiễu, không phải đường cong thời gian. Số không tái tạo được thì
 * không phải số đo (L-E06 / L-G04).
 *
 * Do đó: **mọi con số trong R-01 phải lấy từ file này**, và file này phải commit.
 *
 * CÁCH ĐO: chạy `compile()` trên script THẬT (có `if` per-bar), lặp `REPEATS` lần,
 * lấy **median** — không lấy một lần chạy, vì một lần chạy trên máy đang settle là
 * tung đồng xu (bài học "xác nhận gate có state bằng 2 lần" — handoff 10-09 §3).
 *
 * NGƯỠNG QUYẾT ĐỊNH (ghi trước khi code, không suy ra sau):
 *   median(2000 bar) > 300 ms  ⇒  KHÔNG bật per-bar toàn cục.
 * 300 ms là con số của coordinator, chọn để ổn định trên máy dev chậm; xem
 * `docs/upgrade-standard/plans/PLAN_PINE_STAGE3_2026-10-09.md` §6 R-01.
 *
 * `--json` in JSON để Stage 6 dán thẳng vào TEST_REPORT.
 *
 * Usage:
 *   node scripts/bench-pine-perbar.mjs
 *   node scripts/bench-pine-perbar.mjs --json
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const AS_JSON = process.argv.includes('--json')
const REPEATS = 5
const DECISION_THRESHOLD_MS = 300
const DECISION_BARS = 2000

const require = createRequire(import.meta.url)
function load(entry) {
	const esbuild = require('esbuild')
	const out = esbuild.buildSync({
		entryPoints: [path.join(ROOT, 'src', entry)],
		bundle: true, format: 'cjs', write: false, platform: 'node',
		absWorkingDir: ROOT, logLevel: 'silent',
	})
	const mod = { exports: {} }
	new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require)
	return mod.exports
}

let compile
try {
	compile = load('lib/pinescript/compile.ts').compile
} catch (err) {
	console.error('bench FATAL cannot load compile.ts:', err.message)
	process.exit(2)
}

/** Bars giả nhưng **không** trùng nhau: open ≠ close để `if` thật sự rẽ nhánh. */
function makeBars(n) {
	const open = Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 2) * 10)
	return {
		open,
		high: open.map((v) => v + 1),
		low: open.map((v) => v - 1),
		close: Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 2 + 0.7) * 10),
		volume: new Array(n).fill(1000),
	}
}

/**
 * Script per-bar tượng trưng: `if` + `for` + 2 builtin, **không** dùng `[]` để
 * chạy được NGAY Ở BASELINE — nếu dùng `base[i]` thì script parse lỗi, ta đo được
 * thời gian của một `throw`, tức đo sai thứ cần đo (đó là bài học của chính
 * phiên này: bản đầu của probe đặt `open === close` rồi báo "0 sai").
 *
 * Sau khi W-03 chạy per-bar, chính script này là thứ bị đo lại để so.
 */
const SCRIPT = [
	'indicator("bench", overlay=false)',
	'base = ta.sma(close, 14)',
	'r = ta.rsi(close, 14)',
	'x = base',
	'for i = 0 to 2',
	'  if close > open',
	'    x = base',
	'  else',
	'    x = r',
	'plot(x)',
].join('\n')

/** Script KHÔNG có điều kiện — nhánh "giữ runProgram nguyên tử" của R-01. */
const SCRIPT_FLAT = [
	'indicator("bench-flat", overlay=false)',
	'base = ta.sma(close, 14)',
	'plot(base)',
].join('\n')

function median(xs) {
	const s = [...xs].sort((a, b) => a - b)
	const m = s.length >> 1
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function timeIt(src, bars, repeats) {
	const runs = []
	for (let k = 0; k < repeats; k++) {
		const t0 = process.hrtime.bigint()
		const res = compile(src, bars)
		const ms = Number(process.hrtime.bigint() - t0) / 1e6
		runs.push(ms)
		if (res.errors.length) return { error: res.errors[0].message, runs }
	}
	return { runs }
}

const SIZES = [200, 500, 1000, DECISION_BARS]
const rows = []
for (const n of SIZES) {
	const bars = makeBars(n)
	const cond = timeIt(SCRIPT, bars, REPEATS)
	const flat = timeIt(SCRIPT_FLAT, bars, REPEATS)
	rows.push({
		bars: n,
		conditional_ms: cond.error ? null : Number(median(cond.runs).toFixed(2)),
		conditional_runs: cond.runs.map((x) => Number(x.toFixed(2))),
		conditional_error: cond.error ?? null,
		flat_ms: flat.error ? null : Number(median(flat.runs).toFixed(2)),
		flat_runs: flat.runs.map((x) => Number(x.toFixed(2))),
		flat_error: flat.error ?? null,
	})
}

const decisionRow = rows.find((r) => r.bars === DECISION_BARS)
const decodable = decisionRow.conditional_ms !== null

/**
 * QUAN TRỌNG — con số này đo **thứ gì**:
 *
 * Ở BASELINE, evaluator KHÔNG per-bar: `if` chạy đúng 1 lần cho cả chart
 * (xem PLAN §2.2). Nên `conditional_median` ở baseline là **chi phí của toàn-series
 ***, KHÔNG phải chi phí per-bar. Script chứa `if`/`for` chỉ để nó **parse và chạy
 * được**, không phải để nó per-bar.
 *
 * ⇒ Ở baseline, `UNDER` **KHÔNG có nghĩa** là "an toàn bật per-bar". Nó chỉ nói
 * evaluator hiện tại rẻ. Quyết định thật phải chạy lại script này **SAU** W-03.
 *
 * `PER_BAR_LANDING` đổi thành true ở commit W-03, và chỉ khi đó `UNDER` mới là
 * bằng chứng cho quyết định. Không có cờ này thì verdict chỉ là số đo mô tả.
 */
const PER_BAR_LANDING = true

/**
 * ĐO ĐƯỢC (chạy sau W-03, 5 repeat, median):
 *   bars= 200 →  7.07 ms      bars=1000 →  45.91 ms
 *   bars= 500 → 16.52 ms      bars=2000 → 155.41 ms   (ngưỡng 300 ms)
 *
 * ⇒ `UNDER` ở 2000 bar, nhưng ĐỪNG ĐỌC NHẸM là "rẻ":
 * **TĂNG TRƯỞNG BẬC HAI**. Nhân đôi số bar thì thời gian ×~2.7-3.4:
 * 200→500 là ×2.5 bar / ×2.3 thời gian; 1000→2000 là ×2 bar / ×3.4 thời gian.
 * Ngoại suy 4000 bar ⇒ ~450-520 ms ⇒ VƯỢT ngưỡng 300 ms.
 *
 * Cơ chế: `if` per-bar cắt series `[0, i]` cho từng bar ⇒ tổng O(n²).
 *
 * Hệ quả thực tế: đúng cho chart tương tác (≤2000 bar là thực tế). Trên bộ dữ
 * liệu >3000 bar, `if` trong script sẽ chậm — đây là NỢ KỸ THUẬT ĐÃ BIẾT,
 * không phải chi phí bị giấu. Nếu cần, tối ưu là bỏ `slice` (giữ series đầy
 * đủ, chỉ lấy giá trị tại `i`) — chưa làm vì sẽ đổi ngữ nghĩa `ta.*` nhìn
 * thấy tương lai (xem ledger `PINE_W03_PERBAR_QUADRATIC`).
 */

const verdict = !decodable
	? 'UNDECIDABLE — script lỗi, không đo được. CHƯA đủ cơ sở quyết định.'
	: decisionRow.conditional_ms > DECISION_THRESHOLD_MS
		? 'OVER — KHÔNG bật per-bar toàn cục'
		: PER_BAR_LANDING
			? 'UNDER — per-bar đã LANDING và nằm trong ngưỡng'
			: `MEASURED-BASELINE-ONLY — evaluator CHƯA per-bar (${decisionRow.conditional_ms} ms là chi phí toàn-series). CHƯA quyết được. Chạy lại sau W-03.`

if (AS_JSON) {
	console.log(JSON.stringify({ repeats: REPEATS, threshold_ms: DECISION_THRESHOLD_MS, per_bar_landing: PER_BAR_LANDING, rows, verdict }, null, 2))
} else {
	console.log(`bench-pine-perbar: repeats=${REPEATS} threshold=${DECISION_THRESHOLD_MS}ms @ ${DECISION_BARS} bars`)
	for (const r of rows) {
		console.log(
			`  bars=${String(r.bars).padStart(4)}  conditional_median=${String(r.conditional_ms ?? 'ERR').padStart(8)} ms` +
				`   flat_median=${String(r.flat_ms ?? 'ERR').padStart(8)} ms` +
				`   runs=[${r.conditional_runs.join(', ')}]` +
				(r.conditional_error ? `  ERROR=${r.conditional_error}` : ''),
		)
	}
	console.log(`\nDECISION: ${verdict}`)
	console.log(`REPRODUCE: node scripts/bench-pine-perbar.mjs`)
}
// Chỉ `UNDER` sau khi per-bar LANDING mới exit 0. Ở baseline (hoặc khi đo lỗi) exit 1
// để không ai đọc `exit=0` thành "đã chứng minh per-bar rẻ" — đó là cổng nói dối
// theo cách nhẹ nhất: người đọc chỉ thấy mã thoát (L-E06).
process.exit(verdict.startsWith('UNDER') ? 0 : 1)
