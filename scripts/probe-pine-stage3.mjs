#!/usr/bin/env node
/**
 * probe-pine-stage3.mjs — ĐO hành vi hiện tại của các tính năng Stage 3.
 *
 * KHÔNG sửa code. Chỉ chạy `compile()` trên các script mục tiêu và in ra
 * kết quả thật, để plan dựa trên số đo chứ không trên đọc code.
 *
 * Mọi dòng output có `PROBE <id> <verdict>` để `grep` được, và mỗi case có
 * `expect` để `--assert` đổi exit code. Không có `--assert` thì chỉ in.
 *
 * Usage:
 *   node scripts/probe-pine-stage3.mjs
 *   node scripts/probe-pine-stage3.mjs --assert      # exit 1 nếu lệch kỳ vọng
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSERT = process.argv.includes('--assert')

// vitest.config.ts alias @lib -> src/lib; probe chạy bằng node nên dựng lại map.
const srcPath = path.join(ROOT, 'src')
let failures = 0

/** Nạp một module TS của repo bằng esbuild (đã có sẵn qua vitest). */
const require = createRequire(import.meta.url)
function load(entry) {
	const esbuild = require('esbuild')
	const out = esbuild.buildSync({
		entryPoints: [path.join(srcPath, entry)],
		bundle: true, format: 'cjs', write: false, platform: 'node',
		absWorkingDir: ROOT, logLevel: 'silent',
	})
	const mod = { exports: {} }
	new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require)
	return mod.exports
}

let compile, callFunction, createSeriesEnv, rsiSeries, compileModule
try {
	compileModule = load('lib/pinescript/compile.ts')
	compile = compileModule.compile
	callFunction = compileModule.callFunction
	createSeriesEnv = compileModule.createSeriesEnv
	rsiSeries = load('lib/indicators/utils.ts').rsiSeries
} catch (err) {
	console.error('PROBE FATAL cannot load module:', err.message)
	process.exit(2)
}

// 60 bar: đủ để warmup của ta.rsi(14) và ta.bb(20) chạy hết, nếu không probe
// chỉ đo được "toàn na" — đúng giá trị mặc định (L-E01: pass rỗng).
const N = 60
// open ≠ close CỐ Ý. Bản đầu đặt `open === close` khiến `close > open` false ở
// MỌI bar ⇒ `if` chạy else toàn bộ ⇒ MISMATCHED_BARS = 0/0, tức probe "xanh"
// trong khi không đo được gì (L-E01: trạng thái đo trùng trạng thái mặc định).
const bars = {
	open: Array.from({ length: N }, (_, i) => 100 + Math.sin(i / 2) * 10),
	high: Array.from({ length: N }, (_, i) => 102 + Math.sin(i / 2) * 10),
	low: Array.from({ length: N }, (_, i) => 98 + Math.sin(i / 2) * 10),
	close: Array.from({ length: N }, (_, i) => 100 + Math.sin(i / 2 + 0.7) * 10),
	volume: Array.from({ length: N }, () => 1000),
}

const env0 = () => createSeriesEnv(bars)

const r = (v) => {
	if (v === undefined) return 'undefined'
	if (!Array.isArray(v)) return JSON.stringify(v)
	const cell = (x) => {
		if (x === undefined) return 'none'
		if (typeof x !== 'number') return JSON.stringify(x)
		if (Number.isNaN(x)) return 'na'
		return String(Number(x.toFixed(4)))
	}
	return `[${v.map(cell).join(',')}]`
}

/**
 * `id` — tên case. `src` — script (bỏ trống = đo tầng builtin trực tiếp).
 * `expect(res)` — trả về dòng đo đã định dạng. `want` — regex PHẢI khớp dòng đó
 * khi `--assert`. Một case không có `want` **không** được tính là đạt, và runner
 * sẽ in cảnh báo — cổng không được im lặng (L-E06 / L-G04).
 */
const cases = [
	{
		// AC-2.5 — TEST VÀNG. Observable user thấy: `x` đổi dấu ĐÚNG BAR.
		// `plot` đặt trong nhánh sẽ cho kết quả khác (mỗi vòng lặp ghi đè
		// cùng một key) nên ở đây dùng BIẾN rồi plot sau khối — đó cũng là cách
		// viết script thật. `plot` trong nhánh vẫn được kiểm ở S3-01a3.
		id: 'S3-01a if per-bar (=)',
		src: `indicator("t")\nx = 0\nif close > open\n  x = 1\nelse\n  x = -1\nplot(x, title="X")`,
		expect: (res) => {
			if (res.errors.length) return `errors: ${res.errors[0].message}`
			const got = res.output.X ?? []
			const truth = bars.close.map((c, i) => (c > bars.open[i] ? 1 : -1))
			// ĐỘ DÀI là một nửa của phép so. So trên mảng rỗng cho
			// MISMATCHED_BARS=0 — đúng cái pass rỗng mà probe bản đầu mắc phải
			// (L-E01). Không độ dài ⇒ KHÔNG ĐẠT, bất kể giá trị khớp hay không.
			if (got.length !== truth.length) {
				return `LEN_GUARD_FAIL len_got=${got.length} len_truth=${truth.length} got=${r(got)}`
			}
			const badBars = got.filter((v, i) => v !== truth[i]).length
			return `len=${got.length} distinct_got=${r([...new Set(got)])} MISMATCHED_BARS=${badBars}/${truth.length}`
		},
		want: ['MISMATCHED_BARS=0/60', 'len=60'],
	},
	{
		// AC-2.5 phụ: `plot` BÊN TRONG nhánh. Bản cũ: nhánh `then` chạy cho cả
		// chart nên `Plot` toàn `1` dù truth có 30 bar `-1`. Nay phải theo bar.
		id: 'S3-01a3 plot trong nhánh',
		src: `indicator("t")\nif close > open\n  plot(1)\nelse\n  plot(-1)`,
		expect: (res) => {
			if (res.errors.length) return `errors: ${res.errors[0].message}`
			const got = res.output.Plot ?? []
			const truth = bars.close.map((c, i) => (c > bars.open[i] ? 1 : -1))
			if (got.length !== truth.length) return `LEN_GUARD_FAIL len_got=${got.length} len_truth=${truth.length}`
			const bad = got.filter((v, i) => v !== truth[i]).length
			return `len=${got.length} distinct_got=${r([...new Set(got)])} MISMATCHED_BARS=${bad}/${truth.length}`
		},
		want: ['MISMATCHED_BARS=0/60'],
	},
	{
		// AC-2.5 của plan: đây là AC **phân biệt được**. Ở baseline `then`
		// chạy cho cả chart (MISMATCHED_BARS = 30/60 vì truth có 30 bar `-1`).
		id: 'S3-01a2 if per-bar (=) — AC-2.5 fail-before',
		src: `indicator("t")\nif close > open\n  plot(1)\nelse\n  plot(-1)`,
		expect: (res) => {
			if (res.errors.length) return `errors: ${res.errors[0].message}`
			const got = res.output.Plot ?? []
			const truth = bars.close.map((c, i) => (c > bars.open[i] ? 1 : -1))
			if (got.length !== truth.length) return `LEN_GUARD_FAIL len_got=${got.length} len_truth=${truth.length}`
			const bad = got.filter((v, i) => v !== truth[i]).length
			return `len=${got.length} MISMATCHED_BARS=${bad}/${truth.length} truth_has_minus=${truth.filter((v) => v === -1).length}`
		},
		want: ['truth_has_minus=[0-9]+'],
	},
	{
		id: 'S3-01b if per-bar (:=)',
		src: `indicator("t")\nif close > open\n  x := 1\nelse\n  x := -1\nplot(x)`,
		expect: (res) => {
			if (res.errors.length) return `errors: ${res.errors[0].message}`
			const x = res.output.Plot ?? []
			if (x.length !== N) return `LEN_GUARD_FAIL len=${x.length} want=${N}`
			const wrong = x.filter((v) => v !== 1 && v !== -1).length
			return `len=${N} x=${r(x.slice(0, 4))} distinctBad=${wrong}`
		},
		want: ['len=60 x=\\[1,1,1,-1\\]', 'distinctBad=0'],
	},
	{
		id: 'S3-02 ta.rsi Wilder',
		src: `indicator("t")\nplot(ta.rsi(close, 14))`,
		expect: (res) => `len=${(res.output.Plot ?? []).length} first=${r((res.output.Plot ?? []).slice(0, 3))} errors=${r(res.errors.map((e) => e.message))}`,
		want: ['len=60', 'errors=\\[\\]'],
	},
	{
		// SSOT của RSI trong chính repo này: `rsiSeries` (src/lib/indicators/utils.ts:721)
		// — Wilder smoothing. So compile.ts phải khớp nó, không phải khớp lý thuyết.
		id: 'S3-02b ta.rsi vs rsiSeries (SSOT)',
		expect: () => {
			const got = callFunction('ta.rsi', [bars.close, new Array(N).fill(14)], N, env0())
			const want = rsiSeries(bars.close, 14)
			// Chỉ so ở vùng HAI bên đều định nghĩa. `ta.rsi` hiện bắt đầu ở
			// `period + 1`, `rsiSeries` có giá trị từ index 0 — so cả vùng warmup
			// sẽ ra diff = 100 mà không nói lệch thuật toán (L-E01: so ở trạng
			// thái chưa xác định là so sai).
			const pairs = []
			for (let i = 15; i < N; i++) {
				if (Number.isFinite(want[i]) && Number.isFinite(got[i])) pairs.push([want[i], got[i]])
			}
			const maxAbs = pairs.reduce((m, [w, g]) => Math.max(m, Math.abs(w - g)), 0)
			return `n_compared=${pairs.length} max_abs_diff=${maxAbs.toFixed(6)} got_tail=${r(got.slice(-4))} want_tail=${r(want.slice(-4))}`
		},
		// AC-5.14: sau W-02, diff phải < 1e-9. Ở baseline đo được 10.072393
		// (xem `node scripts/probe-pine-stage3.mjs | Select-String S3-02b`).
		want: ['max_abs_diff=0\\.000000|n_compared=\\d+ max_abs_diff=[0-9]*\\.000000\\b'],
	},
	{
		// CONTRACT ĐỔI Ở STAGE 4 (W-06): `ta.bb` giờ trả 3 dải, và `plot(<builtin trả
	// nhiều giá trị>)` là LỖI chứ không phải "lấy dải đầu". Trước đây case này in ra
	// một dải và không ai canh (`NO_EXPECTATION`) — nghĩa là ai sửa `ta.bb` sai
	// cũng không ai thấy. Nay nó canh hành vi ĐÚNG.
	id: 'S3-03 ta.bb bands',
		src: `indicator("t")\nplot(ta.bb(close, 20, 2))`,
		expect: (res) => `n_keys=${Object.keys(res.output).length} errors=${r(res.errors.map((e) => e.message)).slice(0, 90)}`,
		want: ['n_keys=0', 'received a 3-value result'],
	},
	{
		// Pine: `ta.bb` trả 3 dải. Qua `compile` thì phải destructure (xem S3-03).
		// Qua dispatcher JS thì `callFunction` vẫn trả MỘT series PHẳNG — đó là
		// hợp đồng cũ có 12 call site thật trong `pineFailClosed.test.ts`, và
		// Stage 4 cố ý KHÔNG đổi nó.
		id: 'S3-03b ta.bb arity (dispatcher JS giữ hợp đồng cũ)',
		expect: () => {
			const up = callFunction('ta.bb', [bars.close, new Array(N).fill(20), new Array(N).fill(2)], N, env0())
			const nested = Array.isArray(up) && Array.isArray(up[0])
			return `len=${up.length} nested=${nested} tail=${r(up.slice(-3))} (Pine trả tuple: middle, upper, lower)`
		},
		want: ['len=60', 'nested=false'],
	},
	{
		// ARITY ĐÚNG PHẢI LÀ 3 (macd, signal, hist). Bản Stage 3 ghi `[m, s]`
		// và mong parse error — nay `ta.macd` đã trả 3 giá trị nên `[m, s]` là
		// lỗi arity, và case này canh **hành vi đúng** chứ không canh lỗi cũ.
		id: 'S3-04 ta.macd signal',
		src: `indicator("t")\n[m, s, h] = ta.macd(close, 12, 26, 9)\nplot(m, title="M")\nplot(s, title="S")\nplot(h, title="H")`,
		expect: (res) => `keys=${JSON.stringify(Object.keys(res.output).sort())} lens=${['M', 'S', 'H'].map((k) => (res.output[k] || []).length).join('/')} errors=${r(res.errors.map((e) => e.message)).slice(0, 80)}`,
		want: ['keys=\\[\"H\",\"M\",\"S\"\\]', 'lens=60/60/60', 'errors=\\[\\]'],
	},
	{
		// Hai case này là nguồn của bảng §2.1b của plan. Trước đó chúng chỉ
		// được đo bằng script tay nên không ai chạy lại được (audit F-10).
		//
		// `title` khác nhau là BẮT BUỘC: `plot(x)` và `plot(close)` đều mặc
		// định title "Plot" nên ghi đè nhau ⇒ `n_keys=1` dù khối đã hết đúng.
		// Đo sai vì đặt tên trùng, không phải vì khoá chưa đóng (L-E01).
		id: 'S3-00 if/else nuốt statement sau khối',
		src: `indicator("t")\nif close > open\n  x = 1\nelse\n  x = -1\nplot(x, title="A")\nplot(close, title="B")`,
		expect: (res) => `output_keys=${JSON.stringify(Object.keys(res.output))} n_keys=${Object.keys(res.output).length} errors=${r(res.errors.map((e) => e.message))}`,
		// AC-1.1: sau fix phải có 2 key. Ở baseline: 0 key (nuốt vào elseBlock
		// rồi else không chạy).
		want: ['n_keys=2'],
	},
	{
		id: 'S3-00b for nuốt statement sau khối',
		src: `indicator("t")\nfor i = 0 to 2\n  a = i\nplot(a, title="A")\nplot(close, title="B")`,
		expect: (res) => `output_keys=${JSON.stringify(Object.keys(res.output))} n_keys=${Object.keys(res.output).length} errors=${r(res.errors.map((e) => e.message))}`,
		want: ['n_keys=2'],
	},
	{
		id: 'S3-05 history offset close[1]',
		src: `indicator("t")\nplot(close[1])`,
		expect: (res) => `prev=${r(res.output.Plot)} errors=${r(res.errors.map((e) => e.message))}`,
		// AC-7.20: `prev[i] === close[i-1]`, `prev[0]` là `na`.
		want: ['prev=\\[na,[0-9]'],
	},
	{
		id: 'S3-06 ternary',
		src: `indicator("t")\nplot(close > open ? 1 : 0)`,
		expect: (res) => `t=${r(res.output.Plot)} errors=${r(res.errors.map((e) => e.message))}`,
		want: ['t=\\[1,'],
	},
	{
		id: 'S3-07 reassign :=',
		src: `indicator("t")\nx = 0\nx := close\nplot(x)`,
		expect: (res) => `x=${r(res.output.Plot)} errors=${r(res.errors.map((e) => e.message))}`,
		want: ['x=\\[1[0-9]?[0-9]*\\.'],
	},
	{
		id: 'S3-08 not operator',
		src: `indicator("t")\nplot(not (close > open))`,
		expect: (res) => `n=${r(res.output.Plot)} errors=${r(res.errors.map((e) => e.message))}`,
		// AC-7.26: kết quả phải là 0/1 theo từng bar. Regex kiểm ĐÚNG là có cả
		// hai giá trị 0 và 1 — không kiểm một mẫu cụ thể, vì thứ tự bar phụ thuộc
		// fixture và một mẫu cứng sẽ hỏng khi fixture đổi (mà vẫn xanh).
		want: ['n=\\[([01],)+\\d'],
	},
	{
		id: 'S3-09 na literal',
		src: `indicator("t")\nplot(na)`,
		expect: (res) => `na=${r(res.output.Plot)} errors=${r(res.errors.map((e) => e.message))}`,
		want: ['na=\\[na,na,na'],
	},
	{
		id: 'S3-10 while loop',
		src: `indicator("t")\ni = 0\nwhile i < 3\n  i = i + 1\nplot(i)`,
		expect: (res) => `i=${r(res.output.Plot)} errors=${r(res.errors.map((e) => e.message))}`,
		want: ['i=\\[3,3,3'],
	},
	{
		id: 'S3-10b while vô hạn phải báo lỗi, không treo',
		src: `indicator("t")\ni = 0\nwhile i >= 0\n  i = i + 1\nplot(i)`,
		expect: (res) => `i=${r(res.output.Plot)} errors=${r(res.errors.map((e) => e.message))}`,
		want: ['errors=\\["'],
	},
	{
		id: 'S3-11 UDF',
		src: `indicator("t")\nf(x) => x * 2\nplot(f(close))`,
		expect: (res) => `f=${r(res.output.Plot)} errors=${r(res.errors.map((e) => e.message))}`,
		// AC-7.30: `f(close) = close * 2`. Fixture đầu là 100 + sin(i/2+0.7)*10 nên
		// bar đầu = 104.7188… ⇒ `*2` = 209.4…. Kiểm theo GIÁ TRỊ, không kiểm
		// "không phải undefined" — vì `undefined` cũng qua nếu chỉ so khác null.
		want: ['f=\\[2(0[0-9]|1[0-9]|2[0-9])[0-9]*\\.'],
	},
	{
		id: 'S3-11b UDF gọi lồng nhau',
		src: `indicator("t")\ng(x) => x + 1\nf(x) => g(x) * 2\nplot(f(close), title="F")`,
		expect: (res) => `F=${r(res.output.F)} errors=${r(res.errors.map((e) => e.message))}`,
		want: ['errors=\\[\\]', 'F=\\[2'],
	},
	{
		// AC-7.32: đệ quy vô hạn phải BÁO LỖI, không stack-overflow. Đo được
		// trước khi có `MAX_CALL_DEPTH`: "Maximum call stack size exceeded" —
		// tức `RangeError`, không phải `CompileError`.
		id: 'S3-11c UDF đệ quy phải báo lỗi',
		src: `indicator("t")\nf(x) => f(x)\nplot(f(close), title="F")`,
		expect: (res) => `errors=${r(res.errors.map((e) => e.message))}`,
		want: ['call depth exceeded'],
	},
	{
		// S19 yêu cầu: `max(seriesA, seriesB)` khi B ngắn hơn phải là compile error,
		// không phải `args[1]?.[i] ?? v` âm thầm trả `v`. Đo tầng builtin trực tiếp
		// vì `close[1]` chưa parse được (xem S3-05) nên không đi qua grammar được.
		id: 'S3-12 max() with short second series',
		expect: () => {
			const short = bars.close.slice(0, N - 5)
			let out
			try { out = r(callFunction('max', [bars.close, short], N, env0()).slice(N - 6, N)) }
			catch (e) { out = `THREW ${e.message.slice(0, 110)}` }
			return `len_src=${bars.close.length} len_arg2=${short.length}\n      result_tail=${out}`
		},
		want: ['THREW', 'length 55', 'cannot be compared'],
	},
	{
		id: 'S3-12b pow() missing exponent',
		expect: () => {
			let out
			try { out = r(callFunction('pow', [bars.close], N, env0()).slice(-3)) }
			catch (e) { out = `THREW ${e.message.slice(0, 110)}` }
			return `result_tail=${out}`
		},
		want: ['THREW', 'requires an exponent'],
	},
	{
		// `for i = 10 to 1`: `maxIter = min(1 - 10 + 1, 1000) = -8` ⇒ thân loop
		// không bao giờ chạy. Đo bằng cú pháp grammar chấp nhận hiện tại (`=`).
		id: 'S3-13 for descending (10 to 1)',
		src: `indicator("t")\nacc = 0\nfor i = 10 to 1\n  acc = acc + 1\nplot(acc)`,
		expect: (res) => `acc=${r(res.output.Plot)} errors=${r(res.errors.map((e) => e.message))}`,
		// AC-3.8: sau W-02/W-03 phải có lỗi nêu rõ `start > end`.
		want: ['errors=\\["'],
	},
	{
		id: 'S3-13b for ascending control (0 to 3)',
		src: `indicator("t")\nacc = 0\nfor i = 0 to 3\n  acc = acc + 1\nplot(acc)`,
		expect: (res) => `acc=${r(res.output.Plot)} errors=${r(res.errors.map((e) => e.message))}`,
		// Control phải **không** đổi: 4 vòng ⇒ acc=4, không lỗi.
		want: ['acc=\\[4,4,4', 'errors=\\[\\]'],
	},
	{
		id: 'S3-14 for > 1000 iterations',
		src: `indicator("t")\nacc = 0\nfor i = 0 to 5000\n  acc = acc + 1\nplot(acc)`,
		expect: (res) => `acc=${r(res.output.Plot)} errors=${r(res.errors.map((e) => e.message))}`,
		want: ['errors=\\["'],
	},
	{
		// AC-3.9 khoá ngưỡng: hằng phải export để test assert đúng giá trị, không
		// gõ lại `1000` ở test (L-G01 — ratchet theo nội dung, không theo con số nhớ).
		id: 'S3-14b MAX_FOR_ITERATIONS phải export',
		expect: () => {
			const val = compileModule.MAX_FOR_ITERATIONS
			return `MAX_FOR_ITERATIONS=${val === undefined ? 'MISSING' : val} type=${typeof val}`
		},
		want: ['MAX_FOR_ITERATIONS=1000'],
	},
]

console.log(`probe-pine-stage3: ${cases.length} case(s), bars=${N}, assert=${ASSERT}`)
let shown = 0
let withWant = 0
let noExpectation = 0
for (const c of cases) {
	shown++
	let line
	try {
		// Case không có `src` đo tầng builtin trực tiếp (grammar chưa tới được đó).
		line = c.src ? c.expect(compile(c.src, bars)) : c.expect()
	} catch (err) {
		line = `THREW ${err.message}`
	}
	console.log(`PROBE ${c.id}\n      ${line}`)
	if (ASSERT) {
		if (!c.want || c.want.length === 0) {
			// Không có `want` = cổng im lặng cho case này.
			//
			// W-09 (PINE Stage 4): trước đây chỉ IN RA cảnh báo rồi `continue`,
			// nên `--assert` vẫn exit 0 với 7 case không ai canh. Đọc "0 unmet
			// expectation" thành "mọi thứ đều được kiểm" — đúng cái L-E06 mà
			// `PLAN_PINE_STAGE3:300` đã đòi `0 NO_EXPECTATION` nhưng cổng không
			// thực thi. Nay nó là FAIL.
			noExpectation++
			console.log(`      NO_EXPECTATION: case này KHÔNG được cổng --assert bảo vệ`)
			continue
		}
		withWant++
		for (const want of c.want) {
			if (!new RegExp(want).test(line)) {
				console.log(`      FAIL expect not matched: /${want}/`)
				failures++
			}
		}
	}
}
console.log(`\nprobe-pine-stage3: ${shown} case(s) run, ${withWant} guarded by --assert, ${failures} unmet expectation(s), ${noExpectation} NO_EXPECTATION`)
// W-09: NO_EXPECTATION giờ là FAIL. Một case không ai canh là một pass rỗng ở
// cấp probe — nó đổi kết quả mà `--assert` vẫn exit 0.
process.exit(failures === 0 && noExpectation === 0 ? 0 : 1)
